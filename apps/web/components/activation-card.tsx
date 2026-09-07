'use client';

// Empty-state activation card: shown on the dashboard when an org has zero
// connected integrations AND no alerts — the "connect something" nudge that
// turns a blank dashboard into a live one.

import Link from 'next/link';
import { ArrowRight, Plug, Play } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export function ActivationCard({ onShowDemo }: { onShowDemo: () => void }) {
  const integrations = trpc.settings.integrations.useQuery();
  const alerts = trpc.alerts.list.useQuery({ limit: 1 });

  const anyConnected = (integrations.data ?? []).some((i) => i.connected);
  const hasAlerts = (alerts.data ?? []).length > 0;

  if (integrations.isLoading || alerts.isLoading || integrations.isError || alerts.isError) return null;
  if (anyConnected || hasAlerts) return null;

  return (
    <Card className="border-primary/25 bg-primary/[0.05]" data-testid="activation-card">
      <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="glass-chip flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-primary">
            <Plug className="h-5 w-5" />
          </div>
          <div>
            <p className="font-medium">Connect your first ad account to see live insights</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Connect Google Ads, Meta, or TikTok, enable read-only live mode, then sync
              your account. The demo uses clearly labeled sample data.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button asChild>
            <Link href="/settings">
              Connect an account <ArrowRight />
            </Link>
          </Button>
          <Button variant="outline" onClick={onShowDemo}>
            <Play /> Show me a demo
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

