import type { Metadata } from 'next';
import '@fontsource-variable/space-grotesk';
import '@fontsource-variable/dm-sans';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'Perfexa',
  description: 'Bring ad-account performance, priority signals, and reports into one workspace. Review the evidence and decide with confidence.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-background font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

