'use client';

import Link from 'next/link';
import { RefreshCw } from 'lucide-react';

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="public-shell flex min-h-[70vh] items-center justify-center p-6"><section className="public-card max-w-lg p-8 text-center" aria-labelledby="error-title"><h1 id="error-title" className="font-display text-2xl font-semibold">We couldn’t load this page.</h1><p className="mt-3 text-sm text-muted-foreground">Try loading it again. If the problem continues, return to your workspace.</p><div className="mt-6 flex flex-wrap justify-center gap-3"><button type="button" className="btn-pill btn-pill-ink px-5 py-3" onClick={reset}><RefreshCw size={16} /> Try again</button><Link className="btn-pill px-5 py-3" href="/dashboard">Open workspace</Link></div></section></main>;
}
