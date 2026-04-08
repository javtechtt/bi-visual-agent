'use client';

import { useState, useCallback, useRef } from 'react';
import { Upload, FileSpreadsheet, Loader2 } from 'lucide-react';
import { api } from '@/lib/api-client';
import { ProfileView, type ProfileData } from './profile-view';

type UploadState = 'idle' | 'uploading' | 'done' | 'error';

export function UploadPanel() {
  const [state, setState] = useState<UploadState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ProfileData | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    setState('uploading');
    setError(null);
    setResult(null);

    try {
      const data = await api.upload<ProfileData>('/api/v1/datasets/upload', file);
      setResult(data);
      setState('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
      setState('error');
    }
  }, []);

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
    <div className="space-y-6">
      {/* Drop zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`
          flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-10 transition-all
          ${dragOver ? 'border-indigo-500 bg-indigo-50/50' : 'border-border hover:border-indigo-300 hover:bg-muted/30'}
          ${state === 'uploading' ? 'pointer-events-none opacity-60' : ''}
        `}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />

        {state === 'uploading' ? (
          <>
            <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
            <p className="text-sm font-medium">Uploading and profiling...</p>
            <p className="text-xs text-muted-foreground">The Data Agent is analyzing your file</p>
          </>
        ) : (
          <>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-50">
              {result ? (
                <FileSpreadsheet className="h-6 w-6 text-indigo-600" />
              ) : (
                <Upload className="h-6 w-6 text-indigo-600" />
              )}
            </div>
            <div className="text-center">
              <p className="text-sm font-medium">
                {result ? 'Upload another CSV' : 'Drop a CSV file here, or click to browse'}
              </p>
              <p className="text-xs text-muted-foreground">Max 50 MB</p>
            </div>
          </>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3">
          <p className="text-sm font-medium text-red-800">Upload failed</p>
          <p className="text-xs text-red-600">{error}</p>
        </div>
      )}

      {result && <ProfileView data={result} />}
    </div>
  );
}
