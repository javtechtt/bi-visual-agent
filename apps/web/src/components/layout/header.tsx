'use client';

import { Bell, Search } from 'lucide-react';

export function Header() {
  return (
    <header className="glass flex h-14 items-center justify-between px-6">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-64 items-center gap-2 rounded-lg border border-border bg-surface px-3">
          <Search className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Search datasets, reports...</span>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <button className="transition-theme relative rounded-lg p-2 text-muted-foreground hover:bg-surface hover:text-foreground">
          <Bell className="h-4 w-4" />
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-accent-cyan" />
        </button>

        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-full bg-gradient-to-br from-cyan-500 to-indigo-600" />
          <span className="hidden text-sm font-medium text-foreground md:block">Admin</span>
        </div>
      </div>
    </header>
  );
}
