/**
 * Realtime Session — manages an OpenAI Realtime API WebSocket connection.
 *
 * Architecture:
 *   Browser ←WebSocket→ Node server ←WebSocket→ OpenAI Realtime API
 *
 * The Node server acts as a relay that:
 *   1. Forwards audio from browser to OpenAI
 *   2. Forwards audio/text from OpenAI back to browser
 *   3. Intercepts tool calls and executes them locally
 *   4. Sends tool results back to OpenAI to continue the response
 *
 * Audio format: PCM16 at 24kHz, base64-encoded.
 */

import WebSocket from 'ws';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { TOOL_DEFINITIONS, executeTool } from './realtime-tools.js';

const REALTIME_URL = 'wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview';

const SYSTEM_INSTRUCTIONS = `You are an AI-powered Business Intelligence assistant. You help users analyze their data by calling the available tools.

Your capabilities:
- List available datasets
- Profile datasets to show columns, types, and quality
- Run statistical analysis (KPIs, anomaly detection, trend analysis)
- Generate strategic advisory interpretations of results

Behavior:
- When the user asks about their data, first list_datasets to see what's available
- For analysis questions, call analyze_dataset with the appropriate dataset
- After analysis, offer to generate_advisory for strategic interpretation
- Be concise and conversational — you're speaking aloud, not writing a report
- Lead with the most important finding
- When confidence is low, say so honestly
- Never fabricate numbers — only report what the tools return`;

// ─── Types ─────────────────────────────────────────────────

export type RealtimeEvent =
  | { type: 'state'; state: 'connecting' | 'connected' | 'listening' | 'thinking' | 'speaking' | 'idle' | 'error' }
  | { type: 'transcript'; role: 'user' | 'assistant'; text: string; final: boolean }
  | { type: 'audio'; data: string }  // base64 PCM16
  | { type: 'error'; message: string }
  | { type: 'tool_call'; name: string; args: string }
  | { type: 'done' };

export interface RealtimeSessionCallbacks {
  /** Send an event to the browser client */
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

  /** Open the connection to OpenAI Realtime */
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
        logger.info({ sessionId: this.sessionId }, 'Realtime: connected to OpenAI');
        this.configureSession();
        this.callbacks.onEvent({ type: 'state', state: 'connected' });
        resolve();
      });

      this.ws.on('message', (data) => {
        this.handleOpenAIEvent(JSON.parse(data.toString()));
      });

      this.ws.on('error', (err) => {
        logger.error({ sessionId: this.sessionId, err: err.message }, 'Realtime: WebSocket error');
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

  /** Send audio from the browser to OpenAI */
  sendAudio(base64Audio: string): void {
    this.send({
      type: 'input_audio_buffer.append',
      audio: base64Audio,
    });
  }

  /** Signal that the user stopped speaking */
  commitAudio(): void {
    this.send({ type: 'input_audio_buffer.commit' });
  }

  /** Send a text message (for typed input via the chat panel) */
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

  /** Close the session */
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
        voice: 'alloy',
        input_audio_format: 'pcm16',
        output_audio_format: 'pcm16',
        input_audio_transcription: { model: 'whisper-1' },
        turn_detection: {
          type: 'server_vad',
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 500,
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
        // Ignore unhandled events (rate_limits, etc.)
        break;
    }
  }

  private async handleToolCall(event: Record<string, unknown>): Promise<void> {
    const callId = event.call_id as string;
    const name = event.name as string;
    const argsStr = event.arguments as string;

    logger.info({ sessionId: this.sessionId, tool: name }, 'Realtime: tool call received');
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

    // Send the tool result back to OpenAI
    this.send({
      type: 'conversation.item.create',
      item: {
        type: 'function_call_output',
        call_id: callId,
        output: result,
      },
    });

    // Tell OpenAI to continue generating a response
    this.send({ type: 'response.create' });
  }

  private send(event: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(event));
    }
  }
}
