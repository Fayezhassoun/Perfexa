'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BrandMark } from '@/components/brand-mark';

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [plan, setPlan] = useState<'starter' | 'growth' | 'agency'>('starter');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get('plan');
    if (requested === 'starter' || requested === 'growth' || requested === 'agency') setPlan(requested);
  }, []);

  const register = trpc.auth.register.useMutation({
    onError: (err) => setError(err.message),
    onSuccess: async () => {
      try {
        const res = await signIn('credentials', { email: email.trim(), password, redirect: false });
        if (!res || res.error || !res.ok) {
          router.push('/login');
          return;
        }
        router.push('/onboarding');
        router.refresh();
      } catch {
        // Registration already succeeded. Recover through sign-in, never
        // invite a second registration attempt for the same account.
        router.push('/login');
      }
    },
  });

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    register.mutate({ name: name.trim(), email: email.trim(), password, plan });
  }

  return (
    <div className="public-shell flex min-h-screen items-center justify-center p-4">
      <div className="public-card animate-fade-up w-full max-w-sm rounded-[var(--public-radius-lg)] p-8">
        <div className="mb-6 flex flex-col items-center text-center">
          <BrandMark href="/" layout="mark" size="lg" ariaLabel="Perfexa home" />
          <h1 className="mt-5 font-display text-xl font-semibold tracking-normal">Create your account</h1>
          <p className="mt-1.5 text-sm text-[hsl(var(--ink-soft))]">Bring your accounts, decisions, and reports together.</p>
        </div>
        <div className="mb-6 rounded-lg border border-[hsl(var(--ink)/0.12)] bg-[hsl(var(--cream))] p-3 text-sm">
          <p className="font-semibold capitalize">{plan} plan <span className="font-normal normal-case">· Free during beta</span></p>
          <p className="mt-1 text-xs text-[hsl(var(--ink-soft))]">No card required. Live ad accounts stay read-only.</p>
          <Link href="/pricing" className="mt-2 inline-block text-xs underline underline-offset-4">Compare plans</Link>
        </div>
        <form onSubmit={onSubmit} className="space-y-4" aria-busy={register.isPending}>
          <div className="space-y-2">
            <Label htmlFor="name">Your name</Label>
            <Input
              id="name"
              autoComplete="name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="public-input h-11"
            />
          </div>
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
            <Label htmlFor="password">Password (8+ characters)</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="public-input h-11"
            />
          </div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="btn-pill btn-pill-ink h-11 w-full" disabled={register.isPending}>
            {register.isPending ? 'Creating…' : 'Create account'}
          </Button>
        </form>
        <p className="mt-5 text-center text-sm text-[hsl(var(--ink-soft))]">
          Already have an account?{' '}
          <Link href="/login" className="font-medium text-[hsl(var(--ink))] underline underline-offset-4">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
