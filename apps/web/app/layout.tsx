import type { Metadata } from 'next';
import '@fontsource-variable/space-grotesk';
import '@fontsource-variable/dm-sans';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'Perfexa',
  description: 'Connect read-only ad accounts and get an approval-ready performance report every week.',
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
