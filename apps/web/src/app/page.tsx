'use client';

import { useCallback, useRef, useState, useEffect } from 'react';
import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';
import { ChatPanel } from '@/components/chat/chat-panel';
import { AssistantHero } from '@/components/ai/assistant-hero';
import { useVoice, summarizeForSpeech } from '@/hooks/use-voice';
import { useRealtime } from '@/hooks/use-realtime';

/**
 * Home page — bridges voice/Realtime with the ChatPanel.
 *
 * Strategy:
 *   1. Try to connect to the Realtime WebSocket endpoint
 *   2. If connected → voice flows through OpenAI Realtime (audio in/out, tool calls)
 *   3. If not → falls back to useVoice (Web Speech API) + text query path
 */
export default function HomePage() {
  const [realtimeActive, setRealtimeActive] = useState(false);

  // Refs to bridge voice → chat panel
  const pendingQueryRef = useRef<string | null>(null);
  const submitRef = useRef<((query: string) => void) | null>(null);

  // ─── Realtime path ────────────────────────────────────────

  const realtime = useRealtime({
    onUserTranscript: (text) => {
      // Show the user's transcribed speech in the chat panel
      if (submitRef.current && text.trim()) {
        submitRef.current(text);
      }
    },
    onAssistantMessage: (text) => {
      // The assistant spoke — the audio already played via Realtime.
      // We don't need to do anything extra here since Realtime handles audio out.
      // But if the chat panel needs the text, we could add it.
      void text;
    },
  });

  // Auto-connect Realtime on mount
  useEffect(() => {
    realtime.connect();
    // Check connection after a brief delay
    const timer = setTimeout(() => {
      setRealtimeActive(realtime.connected);
    }, 2000);
    return () => clearTimeout(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Track connection state
  useEffect(() => {
    setRealtimeActive(realtime.connected);
  }, [realtime.connected]);

  // ─── Fallback voice path ──────────────────────────────────

  const voice = useVoice({
    onTranscript: (text) => {
      voice.setOrbState('thinking');
      pendingQueryRef.current = text;
      if (submitRef.current) {
        submitRef.current(text);
      }
    },
  });

  const handleChatSubmit = useCallback((fn: (query: string) => void) => {
    submitRef.current = fn;
  }, []);

  const handleChatResponse = useCallback((response: {
    summary?: string;
    advisory?: { summary?: string; topInsights?: { insight: string }[] } | null;
  }) => {
    // Only auto-speak if we're in fallback mode and the query came from voice
    if (!realtimeActive && pendingQueryRef.current) {
      pendingQueryRef.current = null;
      const spokenSummary = summarizeForSpeech(response);
      voice.speak(spokenSummary);
    }
  }, [realtimeActive, voice]);

  // ─── Unified interface for the hero/panel ─────────────────

  // Pick whichever system is active
  const activeOrb = realtimeActive ? realtime.orbState : voice.orbState;
  const activeTranscript = realtimeActive ? realtime.transcript : voice.transcript;
  const activeSupported = realtimeActive ? realtime.supported : voice.supported;
  const activeError = realtimeActive ? realtime.error : voice.error;

  const handleOrbClick = useCallback(() => {
    if (realtimeActive) {
      if (realtime.orbState === 'listening') {
        realtime.stopListening();
      } else {
        realtime.startListening();
      }
    } else {
      if (voice.orbState === 'listening') {
        voice.stopListening();
      } else {
        voice.startListening();
      }
    }
  }, [realtimeActive, realtime, voice]);

  const handleStopSpeaking = useCallback(() => {
    if (realtimeActive) {
      realtime.disconnect();
      realtime.connect();
    } else {
      voice.stopSpeaking();
    }
  }, [realtimeActive, realtime, voice]);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />
        <main className="flex flex-1 overflow-hidden">
          <section className="flex flex-1 flex-col overflow-y-auto">
            <AssistantHero
              orbState={activeOrb}
              onOrbClick={handleOrbClick}
              onStopSpeaking={handleStopSpeaking}
              transcript={activeTranscript}
              voiceSupported={activeSupported}
              voiceError={activeError}
            />
          </section>
          <aside className="hidden w-[440px] border-l border-border bg-sidebar xl:flex xl:flex-col">
            <ChatPanel
              onRegisterSubmit={handleChatSubmit}
              onResponse={handleChatResponse}
              voiceState={activeOrb}
            />
          </aside>
        </main>
      </div>
    </div>
  );
}
