'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import type { OrbState } from '@/components/ai/voice-orb';

/**
 * useRealtime — connects to the backend Realtime WebSocket endpoint
 * and streams audio in/out using PCM16 at 24kHz.
 *
 * Replaces useVoice when Realtime is available. Falls back gracefully
 * if the WebSocket connection fails.
 */

const WS_URL = (typeof window !== 'undefined' ? window.location.origin.replace(/^http/, 'ws') : '') + '/api/v1/realtime';
const SAMPLE_RATE = 24000;

// ─── Types ─────────────────────────────────────────────────

interface RealtimeEvent {
  type: string;
  state?: string;
  role?: string;
  text?: string;
  final?: boolean;
  data?: string;
  message?: string;
  name?: string;
  args?: string;
}

export interface UseRealtimeOptions {
  /** Called when the assistant produces a final transcript */
  onAssistantMessage?: (text: string) => void;
  /** Called when the user's speech is transcribed */
  onUserTranscript?: (text: string) => void;
}

export interface UseRealtimeReturn {
  orbState: OrbState;
  supported: boolean;
  connected: boolean;
  connect: () => void;
  disconnect: () => void;
  startListening: () => void;
  stopListening: () => void;
  sendText: (text: string) => void;
  transcript: string;
  error: string | null;
}

// ─── Hook ──────────────────────────────────────────────────

export function useRealtime(options: UseRealtimeOptions = {}): UseRealtimeReturn {
  const { onAssistantMessage, onUserTranscript } = options;

  const [orbState, setOrbState] = useState<OrbState>('idle');
  const [connected, setConnected] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const workletRef = useRef<AudioWorkletNode | null>(null);
  const playbackQueueRef = useRef<Float32Array[]>([]);
  const isPlayingRef = useRef(false);

  // Stable refs for callbacks
  const onAssistantMessageRef = useRef(onAssistantMessage);
  onAssistantMessageRef.current = onAssistantMessage;
  const onUserTranscriptRef = useRef(onUserTranscript);
  onUserTranscriptRef.current = onUserTranscript;

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      wsRef.current?.close();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      audioContextRef.current?.close();
    };
  }, []);

  // ─── WebSocket Connection ──────────────────────────────────

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    setError(null);
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      setOrbState('idle');
    };

    ws.onmessage = (ev) => {
      const event: RealtimeEvent = JSON.parse(ev.data as string);
      handleEvent(event);
    };

    ws.onerror = () => {
      setError('Realtime connection failed');
      setConnected(false);
    };

    ws.onclose = () => {
      setConnected(false);
      setOrbState('idle');
      stopMicrophone();
    };
  }, []);

  const disconnect = useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;
    stopMicrophone();
    setConnected(false);
    setOrbState('idle');
  }, []);

  // ─── Event Handler ─────────────────────────────────────────

  function handleEvent(event: RealtimeEvent) {
    switch (event.type) {
      case 'state':
        if (event.state === 'listening') setOrbState('listening');
        else if (event.state === 'thinking') setOrbState('thinking');
        else if (event.state === 'speaking') setOrbState('speaking');
        else if (event.state === 'idle' || event.state === 'connected') setOrbState('idle');
        break;

      case 'transcript':
        if (event.role === 'user' && event.final) {
          setTranscript(event.text ?? '');
          onUserTranscriptRef.current?.(event.text ?? '');
        }
        if (event.role === 'assistant' && event.final) {
          onAssistantMessageRef.current?.(event.text ?? '');
        }
        break;

      case 'audio':
        if (event.data) {
          queueAudioPlayback(event.data);
        }
        break;

      case 'error':
        setError(event.message ?? 'Unknown error');
        break;
    }
  }

  // ─── Microphone Capture ────────────────────────────────────

  const startListening = useCallback(async () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      // Auto-connect if not connected
      connect();
      // Wait a moment for connection, then retry
      await new Promise((r) => setTimeout(r, 1000));
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        setError('Could not connect to Realtime service');
        return;
      }
    }

    setTranscript('');
    setError(null);
    setOrbState('listening');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
      audioContextRef.current = ctx;

      const source = ctx.createMediaStreamSource(stream);

      // Use ScriptProcessor as a simple PCM capture (AudioWorklet would be
      // better for production, but ScriptProcessor works everywhere and keeps
      // this implementation simple)
      const processor = ctx.createScriptProcessor(4096, 1, 1);
      processor.onaudioprocess = (e) => {
        const input = e.inputBuffer.getChannelData(0);
        // Convert Float32 to PCM16
        const pcm16 = new Int16Array(input.length);
        for (let i = 0; i < input.length; i++) {
          const s = Math.max(-1, Math.min(1, input[i] ?? 0));
          pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }
        // Send as base64
        const base64 = bufferToBase64(pcm16.buffer);
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: 'audio', data: base64 }));
        }
      };

      source.connect(processor);
      processor.connect(ctx.destination);
    } catch {
      setError('Microphone access denied');
      setOrbState('idle');
    }
  }, [connect]);

  const stopListening = useCallback(() => {
    stopMicrophone();
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'audio.commit' }));
    }
    setOrbState('thinking');
  }, []);

  function stopMicrophone() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    workletRef.current?.disconnect();
    workletRef.current = null;
    audioContextRef.current?.close();
    audioContextRef.current = null;
  }

  // ─── Audio Playback ────────────────────────────────────────

  function queueAudioPlayback(base64: string) {
    const pcm16 = base64ToInt16(base64);
    const float32 = new Float32Array(pcm16.length);
    for (let i = 0; i < pcm16.length; i++) {
      float32[i] = (pcm16[i] ?? 0) / 0x8000;
    }
    playbackQueueRef.current.push(float32);
    if (!isPlayingRef.current) {
      playNextChunk();
    }
  }

  function playNextChunk() {
    const chunk = playbackQueueRef.current.shift();
    if (!chunk) {
      isPlayingRef.current = false;
      return;
    }
    isPlayingRef.current = true;

    const ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
    const buffer = ctx.createBuffer(1, chunk.length, SAMPLE_RATE);
    buffer.getChannelData(0).set(chunk);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.onended = () => {
      ctx.close();
      playNextChunk();
    };
    source.start();
  }

  // ─── Text Input ────────────────────────────────────────────

  const sendText = useCallback((text: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'text', text }));
      setOrbState('thinking');
    }
  }, []);

  return {
    orbState,
    supported: true, // WebSocket is universally supported
    connected,
    connect,
    disconnect,
    startListening,
    stopListening,
    sendText,
    transcript,
    error,
  };
}

// ─── Helpers ───────────────────────────────────────────────

function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

function base64ToInt16(base64: string): Int16Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Int16Array(bytes.buffer);
}
