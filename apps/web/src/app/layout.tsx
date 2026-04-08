import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'BI Visual Agent — AI-Powered Business Intelligence',
  description: 'Enterprise-grade AI business intelligence platform with multi-agent analytics',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-background font-sans antialiased">
        <div className="relative flex min-h-screen flex-col">
          {children}
        </div>
      </body>
    </html>
  );
}
