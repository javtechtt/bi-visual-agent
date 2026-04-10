'use client';

import { useCallback, useRef } from 'react';
import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';
import { ChatPanel } from '@/components/chat/chat-panel';
import { AssistantHero } from '@/components/ai/assistant-hero';
import { useVoice, summarizeForSpeech } from '@/hooks/use-voice';

export default function HomePage() {
  // Refs to bridge between voice and chat panel
  const pendingQueryRef = useRef<string | null>(null);
  const submitRef = useRef<((query: string) => void) | null>(null);

  const voice = useVoice({
    onTranscript: (text) => {
      // When speech is captured, submit it as a query via the chat panel
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
    // Only auto-speak if the query came from voice
    if (pendingQueryRef.current) {
      pendingQueryRef.current = null;
      const spokenSummary = summarizeForSpeech(response);
      voice.speak(spokenSummary);
    }
  }, [voice]);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />
        <main className="flex flex-1 overflow-hidden">
          {/* Left: AI-first experience */}
          <section className="flex flex-1 flex-col overflow-y-auto">
            <AssistantHero
              orbState={voice.orbState}
              onOrbClick={voice.orbState === 'listening' ? voice.stopListening : voice.startListening}
              onStopSpeaking={voice.stopSpeaking}
              transcript={voice.transcript}
              voiceSupported={voice.supported}
              voiceError={voice.error}
            />
          </section>
          {/* Right: Persistent assistant panel */}
          <aside className="hidden w-[440px] border-l border-border bg-sidebar xl:flex xl:flex-col">
            <ChatPanel
              onRegisterSubmit={handleChatSubmit}
              onResponse={handleChatResponse}
              voiceState={voice.orbState}
            />
          </aside>
        </main>
      </div>
    </div>
  );
}
