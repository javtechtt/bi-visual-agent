import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';
import { ChatPanel } from '@/components/chat/chat-panel';
import { AssistantHero } from '@/components/ai/assistant-hero';

export default function HomePage() {
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />
        <main className="flex flex-1 overflow-hidden">
          {/* Left: AI-first experience */}
          <section className="flex flex-1 flex-col overflow-y-auto">
            <AssistantHero />
          </section>
          {/* Right: Persistent assistant panel */}
          <aside className="hidden w-[440px] border-l border-border bg-sidebar xl:flex xl:flex-col">
            <ChatPanel />
          </aside>
        </main>
      </div>
    </div>
  );
}
