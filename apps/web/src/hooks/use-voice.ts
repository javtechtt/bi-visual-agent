'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import type { OrbState } from '@/components/ai/voice-orb';

// ─── Web Speech API type shims ─────────────────────────────
// These types aren't in all TS libs, so we declare just enough.

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message?: string;
}

interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((ev: SpeechRecognitionEvent) => void) | null;
  onerror: ((ev: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

// ─── Hook ──────────────────────────────────────────────────

export interface UseVoiceOptions {
  /** Called with the final transcript when speech recognition completes */
  onTranscript?: (text: string) => void;
  /** Language for recognition and synthesis */
  lang?: string;
}

export interface UseVoiceReturn {
  /** Current orb state — drives VoiceOrb visual */
  orbState: OrbState;
  /** Whether the browser supports speech recognition */
  supported: boolean;
  /** Start listening for voice input */
  startListening: () => void;
  /** Stop listening */
  stopListening: () => void;
  /** Speak text aloud. Resolves when speech finishes. */
  speak: (text: string) => Promise<void>;
  /** Stop any ongoing speech */
  stopSpeaking: () => void;
  /** The interim transcript while user is speaking */
  transcript: string;
  /** Last error message, if any */
  error: string | null;
  /** Manually set orb state (e.g. for "thinking") */
  setOrbState: (state: OrbState) => void;
}

export function useVoice(options: UseVoiceOptions = {}): UseVoiceReturn {
  const { onTranscript, lang = 'en-US' } = options;

  const [orbState, setOrbState] = useState<OrbState>('idle');
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [supported, setSupported] = useState(false);

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;

  // Detect browser support on mount
  useEffect(() => {
    const win = typeof window !== 'undefined' ? window : null;
    if (!win) return;

    const SpeechRecognition = (
      (win as unknown as Record<string, unknown>).SpeechRecognition ??
      (win as unknown as Record<string, unknown>).webkitSpeechRecognition
    ) as SpeechRecognitionConstructor | undefined;

    if (SpeechRecognition) {
      setSupported(true);
      const rec = new SpeechRecognition();
      rec.continuous = false;
      rec.interimResults = true;
      rec.lang = lang;
      recognitionRef.current = rec;
    }

    synthRef.current = win.speechSynthesis ?? null;
  }, [lang]);

  // ─── Recognition ─────────────────────────────────────────

  const startListening = useCallback(() => {
    const rec = recognitionRef.current;
    if (!rec) {
      setError('Speech recognition not supported in this browser.');
      return;
    }

    setError(null);
    setTranscript('');

    rec.onstart = () => {
      setOrbState('listening');
    };

    rec.onresult = (ev: SpeechRecognitionEvent) => {
      let interim = '';
      let final = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const result = ev.results[i];
        if (result) {
          const text = result[0]?.transcript ?? '';
          if (result.isFinal) {
            final += text;
          } else {
            interim += text;
          }
        }
      }
      setTranscript(final || interim);

      if (final) {
        onTranscriptRef.current?.(final.trim());
      }
    };

    rec.onerror = (ev: SpeechRecognitionErrorEvent) => {
      // "no-speech" and "aborted" are expected — not real errors
      if (ev.error === 'no-speech' || ev.error === 'aborted') {
        setOrbState('idle');
        return;
      }
      setError(`Speech error: ${ev.error}`);
      setOrbState('idle');
    };

    rec.onend = () => {
      // Only return to idle if we're still in listening state
      // (not if we've already transitioned to thinking)
      setOrbState((prev) => (prev === 'listening' ? 'idle' : prev));
    };

    try {
      rec.start();
    } catch {
      setError('Could not start speech recognition. Check microphone permissions.');
      setOrbState('idle');
    }
  }, []);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setOrbState('idle');
  }, []);

  // ─── Synthesis ───────────────────────────────────────────

  const speak = useCallback((text: string): Promise<void> => {
    return new Promise((resolve) => {
      const synth = synthRef.current;
      if (!synth) {
        resolve();
        return;
      }

      // Cancel any ongoing speech
      synth.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = lang;
      utterance.rate = 1.0;
      utterance.pitch = 1.0;

      utterance.onstart = () => {
        setOrbState('speaking');
      };

      utterance.onend = () => {
        setOrbState('idle');
        resolve();
      };

      utterance.onerror = () => {
        setOrbState('idle');
        resolve();
      };

      synth.speak(utterance);
    });
  }, [lang]);

  const stopSpeaking = useCallback(() => {
    synthRef.current?.cancel();
    setOrbState('idle');
  }, []);

  return {
    orbState,
    supported,
    startListening,
    stopListening,
    speak,
    stopSpeaking,
    transcript,
    error,
    setOrbState,
  };
}

// ─── Response Summarizer ───────────────────────────────────

/**
 * Extract a concise spoken summary from a query response.
 * Prioritizes: advisory summary > top insight > fallback summary.
 * Keeps it under ~200 chars for comfortable speech duration.
 */
export function summarizeForSpeech(response: {
  summary?: string;
  advisory?: { summary?: string; topInsights?: { insight: string }[] } | null;
}): string {
  // 1. Advisory summary is the best — already written for humans
  if (response.advisory?.summary) {
    return truncateForSpeech(response.advisory.summary);
  }

  // 2. Top insight from advisory
  const topInsight = response.advisory?.topInsights?.[0]?.insight;
  if (topInsight) {
    return truncateForSpeech(topInsight);
  }

  // 3. Fall back to the text summary
  if (response.summary) {
    // The summary can be multi-line with formatting. Take just the first sentence.
    const firstLine = response.summary.split('\n').find((l) => l.trim().length > 10);
    if (firstLine) {
      return truncateForSpeech(firstLine.trim());
    }
  }

  return 'Analysis complete. Check the results panel for details.';
}

function truncateForSpeech(text: string, maxLen = 250): string {
  if (text.length <= maxLen) return text;
  // Cut at the last sentence boundary before maxLen
  const truncated = text.slice(0, maxLen);
  const lastPeriod = truncated.lastIndexOf('.');
  if (lastPeriod > maxLen * 0.5) {
    return truncated.slice(0, lastPeriod + 1);
  }
  return truncated + '...';
}
