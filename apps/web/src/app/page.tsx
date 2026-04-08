import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';
import { ChatPanel } from '@/components/chat/chat-panel';
import { DashboardGrid } from '@/components/dashboard/dashboard-grid';

export default function HomePage() {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />
        <main className="flex flex-1 overflow-hidden">
          <section className="flex-1 overflow-y-auto p-6">
            <DashboardGrid />
          </section>
          <aside className="w-[420px] border-l border-border">
            <ChatPanel />
          </aside>
        </main>
      </div>
    </div>
  );
}
