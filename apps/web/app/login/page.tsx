'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { Mic } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

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
    <div className="vox-backdrop flex min-h-screen items-center justify-center p-4">
      <Card className="glass animate-fade-up w-full max-w-sm rounded-2xl">
        <CardHeader className="text-center">
          <div className="animate-pulse-glow mx-auto mb-2 flex h-11 w-11 items-center justify-center rounded-xl vox-gradient">
            <Mic className="h-5 w-5 text-white" />
          </div>
          <CardTitle>Welcome back</CardTitle>
          <CardDescription>Sign in to talk to your marketing team</CardDescription>
        </CardHeader>
        <CardContent>
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
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            New here?{' '}
            <Link href="/register" className="text-foreground underline underline-offset-4">
              Create an account
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
