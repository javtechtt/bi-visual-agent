'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BarChart3, Database, FileText, Home, Settings, Sparkles } from 'lucide-react';

const navigation = [
  { name: 'Dashboard', href: '/', icon: Home },
  { name: 'Datasets', href: '/datasets', icon: Database },
  { name: 'Analytics', href: '/analytics', icon: BarChart3 },
  { name: 'Reports', href: '/reports', icon: FileText },
  { name: 'AI Agents', href: '/agents', icon: Sparkles },
  { name: 'Settings', href: '/settings', icon: Settings },
] as const;

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex w-16 flex-col items-center border-r border-border bg-sidebar py-4 lg:w-56">
      {/* Logo */}
      <div className="mb-8 flex items-center gap-2.5 px-4">
        <div className="glow-cyan flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500 to-indigo-600">
          <Sparkles className="h-4 w-4 text-white" />
        </div>
        <span className="hidden text-sm font-semibold tracking-tight text-foreground lg:block">
          BI Visual Agent
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex flex-1 flex-col gap-0.5 px-2">
        {navigation.map((item) => {
          const active = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
          return (
            <Link
              key={item.name}
              href={item.href}
              className={`transition-theme flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${
                active
                  ? 'bg-surface-raised font-medium text-accent-cyan'
                  : 'text-muted-foreground hover:bg-surface hover:text-foreground'
              }`}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              <span className="hidden lg:block">{item.name}</span>
            </Link>
          );
        })}
      </nav>

      {/* Status */}
      <div className="px-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-success" />
          <span className="hidden lg:block">System active</span>
        </div>
      </div>
    </aside>
  );
}
