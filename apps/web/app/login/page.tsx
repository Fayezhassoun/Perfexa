'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BrandMark } from '@/components/brand-mark';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await signIn('credentials', { email, password, redirect: false });
    setBusy(false);
    if (res?.error) {
      setError('That email and password combination did not work.');
      return;
    }
    router.push('/console');
    router.refresh();
  }

  return (
    <div className="public-shell flex min-h-screen items-center justify-center p-4">
      <div className="public-card animate-fade-up w-full max-w-sm rounded-[var(--public-radius-lg)] p-8">
        <div className="mb-6 flex flex-col items-center text-center">
          <BrandMark layout="mark" size="lg" ariaLabel="Perfexa logo" />
          <h1 className="mt-5 font-display text-xl font-semibold tracking-normal">Welcome back</h1>
          <p className="mt-1.5 text-sm text-[hsl(var(--ink-soft))]">Sign in to your performance marketing workspace</p>
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="public-input h-11"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="public-input h-11"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="btn-pill btn-pill-ink h-11 w-full" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
        <p className="mt-5 text-center text-sm text-[hsl(var(--ink-soft))]">
          New here?{' '}
          <Link href="/register" className="font-medium text-[hsl(var(--ink))] underline underline-offset-4">
            Create an account
          </Link>
        </p>
      </div>
    </div>
  );
}
