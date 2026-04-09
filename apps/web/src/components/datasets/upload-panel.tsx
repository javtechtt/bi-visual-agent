'use client';

import { useState, useCallback, useRef } from 'react';
import { Upload, Loader2 } from 'lucide-react';
import { api } from '@/lib/api-client';
import type { ProfileData } from './profile-view';

export function UploadPanel({ onUploaded }: { onUploaded: (data: ProfileData) => void }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    async (file: File) => {
      setUploading(true);
      setError(null);
      try {
        const data = await api.upload<ProfileData>('/api/v1/datasets/upload', file);
        onUploaded(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Upload failed');
      } finally {
        setUploading(false);
      }
    },
    [onUploaded],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`
          flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-8 transition-all
          ${dragOver ? 'border-accent-cyan bg-accent-cyan/5' : 'border-border hover:border-accent-cyan/30 hover:bg-surface'}
          ${uploading ? 'pointer-events-none opacity-60' : ''}
        `}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.xlsx,.xls,.pdf"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
            e.target.value = '';
          }}
        />
        {uploading ? (
          <>
            <Loader2 className="h-8 w-8 animate-spin text-accent-cyan" />
            <p className="text-sm font-medium">Uploading and profiling...</p>
          </>
        ) : (
          <>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-cyan/10">
              <Upload className="h-5 w-5 text-accent-cyan" />
            </div>
            <p className="text-sm font-medium">Drop a file here, or click to browse</p>
            <p className="text-xs text-muted-foreground">CSV, Excel, or PDF — max 50 MB</p>
          </>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3">
          <p className="text-sm font-medium text-red-400">Upload failed</p>
          <p className="text-xs text-red-300/70">{error}</p>
        </div>
      )}
    </div>
  );
}
