import Link from 'next/link';
import { BrandMark } from '@/components/brand-mark';

export default function NotFound() {
  return <main className="public-shell flex min-h-screen items-center justify-center p-6"><section className="public-card max-w-lg p-10 text-center"><div className="flex justify-center"><BrandMark href="/" size="md" /></div><p className="mt-8 text-sm text-muted-foreground">404 · Page not found</p><h1 className="mt-3 font-display text-3xl font-semibold">Let’s get you back to your work.</h1><p className="mt-4 text-sm text-muted-foreground">This address may have changed, or the link may be incomplete.</p><Link href="/dashboard" className="btn-pill btn-pill-ink mt-7 px-6 py-3">Open workspace</Link></section></main>;
}
