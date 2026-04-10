'use client';

import { useCallback, useRef, useState, useEffect } from 'react';
import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';
import { ChatPanel } from '@/components/chat/chat-panel';
import { VoiceOrb } from '@/components/ai/voice-orb';
import { useVoice, summarizeForSpeech } from '@/hooks/use-voice';
import { useRealtime } from '@/hooks/use-realtime';

export default function HomePage() {
  const [realtimeActive, setRealtimeActive] = useState(false);
  const pendingQueryRef = useRef<string | null>(null);
  const submitRef = useRef<((query: string) => void) | null>(null);

  const realtime = useRealtime({
    onUserTranscript: (text) => {
      if (submitRef.current && text.trim()) submitRef.current(text);
    },
    onAssistantMessage: () => {},
  });

  useEffect(() => {
    realtime.connect();
    const timer = setTimeout(() => setRealtimeActive(realtime.connected), 2000);
    return () => clearTimeout(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setRealtimeActive(realtime.connected);
  }, [realtime.connected]);

  const voice = useVoice({
    onTranscript: (text) => {
      voice.setOrbState('thinking');
      pendingQueryRef.current = text;
      if (submitRef.current) submitRef.current(text);
    },
  });

  const handleChatSubmit = useCallback((fn: (query: string) => void) => {
    submitRef.current = fn;
  }, []);

  const handleChatResponse = useCallback((response: {
    summary?: string;
    advisory?: { summary?: string; topInsights?: { insight: string }[] } | null;
  }) => {
    if (!realtimeActive && pendingQueryRef.current) {
      pendingQueryRef.current = null;
      voice.speak(summarizeForSpeech(response));
    }
  }, [realtimeActive, voice]);

  const activeOrb = realtimeActive ? realtime.orbState : voice.orbState;
  const activeTranscript = realtimeActive ? realtime.transcript : voice.transcript;
  const activeSupported = realtimeActive ? realtime.supported : voice.supported;
  const activeError = realtimeActive ? realtime.error : voice.error;

  const handleOrbClick = useCallback(() => {
    if (realtimeActive) {
      realtime.orbState === 'listening' ? realtime.stopListening() : realtime.startListening();
    } else {
      voice.orbState === 'listening' ? voice.stopListening() : voice.startListening();
    }
  }, [realtimeActive, realtime, voice]);

  const handleStopSpeaking = useCallback(() => {
    if (realtimeActive) { realtime.disconnect(); realtime.connect(); }
    else voice.stopSpeaking();
  }, [realtimeActive, realtime, voice]);

  const orbLabel = activeOrb === 'listening' ? 'Listening...'
    : activeOrb === 'thinking' ? 'Analyzing...'
    : activeOrb === 'speaking' ? 'Speaking...'
    : activeSupported ? 'Tap to speak' : '';

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />
        <main className="flex flex-1 flex-col overflow-hidden">
          {/* ─── Assistant-centered layout ─── */}
          <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col overflow-hidden px-4">

            {/* Orb + status — compact, always visible */}
            <div className="flex shrink-0 flex-col items-center gap-1.5 pb-3 pt-6">
              <button
                onClick={activeOrb === 'speaking' ? handleStopSpeaking : handleOrbClick}
                disabled={!activeSupported && activeOrb === 'idle'}
                className="transition-transform hover:scale-105 active:scale-95 disabled:opacity-40"
              >
                <VoiceOrb state={activeOrb} size={64} intensity={activeOrb === 'idle' ? 0.4 : 0.8} />
              </button>
              {orbLabel && (
                <p className="text-[11px] font-medium text-muted-foreground">{orbLabel}</p>
              )}
              {activeOrb === 'listening' && activeTranscript && (
                <p className="max-w-sm text-center text-xs text-accent-cyan">&ldquo;{activeTranscript}&rdquo;</p>
              )}
              {activeError && (
                <p className="text-[11px] text-error">{activeError}</p>
              )}
            </div>

            {/* Conversation — the primary experience */}
            <div className="flex-1 overflow-hidden">
              <ChatPanel
                onRegisterSubmit={handleChatSubmit}
                onResponse={handleChatResponse}
                voiceState={activeOrb}
                embedded
              />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
