import { UploadPanel } from '@/components/datasets/upload-panel';
import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';

export default function DatasetsPage() {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="mx-auto max-w-4xl space-y-6">
            <div>
              <h1 className="text-xl font-semibold tracking-tight">Datasets</h1>
              <p className="text-sm text-muted-foreground">
                Upload a CSV to profile columns, assess quality, and prepare for analysis.
              </p>
            </div>
            <UploadPanel />
          </div>
        </main>
      </div>
    </div>
  );
}
