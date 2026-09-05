'use client';

import {
  Activity,
  ArrowUpRight,
  BarChart3,
  Check,
  Clapperboard,
  Globe,
  Info,
  Megaphone,
  ScrollText,
  Share2,
  ShieldCheck,
  X,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

export type IntegrationPlatform = 'google_ads' | 'meta' | 'tiktok' | 'ga4' | 'gsc';

export type IntegrationRecord = {
  platform: IntegrationPlatform;
  connected: boolean;
  mode: 'sandbox' | 'live';
  status: string;
  externalAccountId: string | null;
  health: string;
  oauthConfigured: boolean;
  missingConfiguration?: string[];
  oauthConnected?: boolean;
  connectUrl: string | null;
};

type PlatformConfig = {
  name: string;
  shortName: string;
  description: string;
  dataProvided: string;
  connectOutcome: string;
  accent: string;
  iconBackground: string;
  icon: typeof Megaphone;
};

export const PLATFORM_CONFIG: Record<IntegrationPlatform, PlatformConfig> = {
  google_ads: {
    name: 'Google Ads',
    shortName: 'Google',
    description: 'Bring paid search performance into your growth workspace.',
    dataProvided: 'Campaign performance, CPC/CPA, keyword data',
    connectOutcome: 'Campaign reporting stays current without moving your ad spend.',
    accent: 'bg-[hsl(var(--primary))]',
    iconBackground: 'bg-primary/12 text-primary',
    icon: Megaphone,
  },
  meta: {
    name: 'Meta',
    shortName: 'Meta',
    description: 'Unify Facebook and Instagram performance with the rest of your funnel.',
    dataProvided: 'Ad set metrics, audience reach, creative performance',
    connectOutcome: 'See what is resonating across Facebook and Instagram in one view.',
    accent: 'bg-[hsl(var(--accent))]',
    iconBackground: 'bg-accent/12 text-accent dark:text-accent',
    icon: Share2,
  },
  tiktok: {
    name: 'TikTok',
    shortName: 'TikTok',
    description: 'Track the creative signals behind short-form campaign growth.',
    dataProvided: 'Video ad metrics, engagement rates, trend data',
    connectOutcome: 'Creative and engagement signals feed into your weekly decisions.',
    accent: 'bg-[hsl(var(--foreground))]',
    iconBackground: 'bg-foreground/8 text-foreground',
    icon: Clapperboard,
  },
  ga4: {
    name: 'Google Analytics 4',
    shortName: 'GA4',
    description: 'Connect the site journey to the campaigns that started it.',
    dataProvided: 'Site traffic, conversion paths, audience segments',
    connectOutcome: 'Understand which channels turn attention into meaningful action.',
    accent: 'bg-amber-500',
    iconBackground: 'bg-amber-500/12 text-amber-700 dark:text-amber-300',
    icon: Globe,
  },
  gsc: {
    name: 'Search Console',
    shortName: 'GSC',
    description: 'Keep organic visibility and high-intent search terms in view.',
    dataProvided: 'Search impressions, click-through, keyword rankings',
    connectOutcome: 'Spot search momentum and gaps before they become missed demand.',
    accent: 'bg-emerald-500',
    iconBackground: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300',
    icon: ScrollText,
  },
};

function PlatformIcon({ platform }: { platform: IntegrationPlatform }) {
  const config = PLATFORM_CONFIG[platform];
  const Icon = config.icon;

  return (
    <div className={cn('relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/30 shadow-sm', config.iconBackground)}>
      <Icon className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
      <span className="absolute -bottom-1 -right-1 rounded-md border border-background/70 bg-background/90 px-1.5 py-0.5 text-[9px] font-bold tracking-[0.08em] text-foreground shadow-sm">
        {config.shortName}
      </span>
    </div>
  );
}

/**
 * The truthful state of one integration, derived only from the server-provided
 * record. Live connections are supported by the product. `setup_needed` means
 * this deployment is missing the platform's OAuth app credentials, not that the
 * feature is "coming soon".
 */
export type IntegrationConnectionState =
  | 'setup_needed' // OAuth not configured on this deployment; sandbox still works
  | 'ready_to_connect' // OAuth configured; no account connected yet
  | 'connected_sandbox' // connected, still in sandbox mode
  | 'connected_live' // connected and live
  | 'connection_error'; // connected row exists but the connection needs attention

export function integrationConnectionState(integration: IntegrationRecord): IntegrationConnectionState {
  if (!integration.connected) {
    return integration.oauthConfigured ? 'ready_to_connect' : 'setup_needed';
  }
  if (integration.status !== 'connected') return 'connection_error';
  return integration.mode === 'live' ? 'connected_live' : 'connected_sandbox';
}

/** The next actionable step for the operator, one per connection state. */
export function integrationNextStep(integration: IntegrationRecord): string {
  const config = PLATFORM_CONFIG[integration.platform];
  switch (integrationConnectionState(integration)) {
    case 'setup_needed':
      return `Sandbox mode works now. A live ${config.name} connection needs an operator to add the OAuth app credentials to this deployment first.`;
    case 'ready_to_connect':
      return `Next step: connect your ${config.name} account with read-only OAuth. it starts in sandbox until you approve live mode.`;
    case 'connected_sandbox':
      return integration.oauthConfigured
        ? integration.oauthConnected
          ? 'Next step: verify the account, then Go Live. You will type LIVE to confirm read-only access.'
          : 'Go Live is blocked until you connect a real account through OAuth. The current connection is simulated.'
        : `Sandbox mode works now. Going live needs an operator to add the ${config.name} OAuth app credentials to this deployment first.`;
    case 'connected_live':
      return 'Live mode is on. Sync now to read real account data. The pilot cannot change campaigns or spend.';
    case 'connection_error':
      return integration.connectUrl
        ? 'This connection needs attention. reconnect to restore syncing.'
        : `This connection needs attention. an operator must restore the ${config.name} OAuth app credentials before you can reconnect.`;
  }
}

function ConnectionStatus({ integration }: { integration: IntegrationRecord }) {
  switch (integrationConnectionState(integration)) {
    case 'setup_needed':
      return <Badge variant="secondary">Setup needed</Badge>;
    case 'ready_to_connect':
      return <Badge variant="outline">Ready to connect</Badge>;
    case 'connection_error':
      return <Badge variant="destructive">Needs reconnect</Badge>;
    case 'connected_sandbox':
      return <Badge variant="warning">Sandbox</Badge>;
    case 'connected_live':
      return <Badge variant="success">Live</Badge>;
  }
}

function HealthIndicator({ integration }: { integration: IntegrationRecord }) {
  if (!integration.connected) return null;

  const live = integration.mode === 'live';
  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
      title={integration.health}
    >
      <span className={cn('h-2 w-2 rounded-full ring-4', live ? 'bg-emerald-500 ring-emerald-500/10' : 'bg-amber-500 ring-amber-500/10')} />
      {live ? 'Live mode selected' : 'Sandbox mode selected'}
    </span>
  );
}

export function IntegrationPlatformCard({
  integration,
  onConnect,
  onGoLive,
  onSwitchToSandbox,
  connectPending,
  setModePending,
}: {
  integration: IntegrationRecord;
  onConnect: () => void;
  onGoLive: () => void;
  onSwitchToSandbox: () => void;
  connectPending: boolean;
  setModePending: boolean;
}) {
  const config = PLATFORM_CONFIG[integration.platform];
  const state = integrationConnectionState(integration);

  return (
    <Card className="group relative min-w-0 overflow-hidden transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[var(--glass-shadow-hover)]">
      <div className={cn('absolute inset-x-0 top-0 h-1 opacity-80', config.accent)} />
      <CardContent className="flex h-full flex-col gap-5 p-5 pt-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <PlatformIcon platform={integration.platform} />
            <div className="min-w-0">
              <h3 className="truncate font-display text-base font-semibold tracking-tight">{config.name}</h3>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{config.description}</p>
            </div>
          </div>
          <ConnectionStatus integration={integration} />
        </div>

        <div className="grid gap-3 rounded-2xl border border-[color:var(--glass-border)] bg-[color:var(--glass-bg-subtle)] p-3.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.13em] text-muted-foreground">
              What you get
              <span title={`What you get from ${config.name}: ${config.dataProvided}`}>
                <Info className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
            </div>
            <p className="mt-1.5 text-sm leading-5">{config.dataProvided}</p>
          </div>
          <HealthIndicator integration={integration} />
        </div>

        <div className="flex flex-1 flex-col justify-end gap-4">
          <div className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
            <span>{config.connectOutcome}</span>
          </div>

          {!integration.oauthConfigured && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-500/25 bg-amber-500/8 px-3 py-2.5 text-xs leading-5 text-amber-700 dark:text-amber-300">
              <Activity className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>
                {config.name} is not configured on this deployment. Missing OAuth app credentials:
                {' '}{integration.missingConfiguration?.join(' + ') || 'provider configuration'}.
                Sandbox mode is fully available now.
              </span>
            </div>
          )}

          <div className="flex flex-col gap-2 border-t border-[color:var(--glass-divider)] pt-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 text-xs text-muted-foreground">
              {integration.connected && (
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate">{integration.externalAccountId ?? 'Connected account'}</span>
                  <span aria-hidden="true">·</span>
                  <span className="shrink-0">{integration.mode === 'live' ? 'Live mode' : 'Sandbox mode'}</span>
                </span>
              )}
              <p className={cn('leading-5', integration.connected && 'mt-1')}>{integrationNextStep(integration)}</p>
            </div>

            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
              {(state === 'ready_to_connect' || (state === 'connected_sandbox' && !integration.oauthConnected)) && integration.connectUrl && (
                <Button variant="default" size="sm" asChild className="w-full sm:w-auto">
                  <a href={integration.connectUrl}>
                    Connect account
                    <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </a>
                </Button>
              )}

              {!integration.connected && (
                <Button
                  variant={integration.oauthConfigured ? 'outline' : 'default'}
                  size="sm"
                  className="w-full sm:w-auto"
                  disabled={connectPending}
                  onClick={onConnect}
                >
                  {connectPending ? 'Connecting…' : 'Connect sandbox (simulated)'}
                </Button>
              )}

              {state === 'connection_error' && integration.connectUrl && (
                <Button variant="default" size="sm" asChild className="w-full sm:w-auto">
                  <a href={integration.connectUrl}>
                    Reconnect
                    <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </a>
                </Button>
              )}

              {state === 'connected_sandbox' && integration.oauthConfigured && integration.oauthConnected && (
                <Button
                  variant="default"
                  size="sm"
                  className="w-full sm:w-auto"
                  disabled={setModePending}
                  onClick={onGoLive}
                >
                  Go Live
                </Button>
              )}

              {(state === 'connected_live' || (state === 'connection_error' && integration.mode === 'live')) && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full sm:w-auto"
                  disabled={setModePending}
                  onClick={onSwitchToSandbox}
                >
                  Back to sandbox
                </Button>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function GoLiveDialog({
  platform,
  confirmText,
  error,
  pending,
  onConfirmTextChange,
  onConfirm,
  onCancel,
}: {
  platform: IntegrationPlatform;
  confirmText: string;
  error?: string;
  pending: boolean;
  onConfirmTextChange: (value: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const config = PLATFORM_CONFIG[platform];
  const canConfirm = confirmText === 'LIVE';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/30 p-4 backdrop-blur-sm" role="presentation" onMouseDown={onCancel}>
      <div
        className="glass-elevated w-full max-w-md rounded-[24px] p-6 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="go-live-title"
        aria-describedby="go-live-description"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/12 text-amber-600 dark:text-amber-300">
              <BarChart3 className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-amber-600 dark:text-amber-300">Mode change</p>
              <h2 id="go-live-title" className="mt-1 font-display text-lg font-semibold tracking-tight">Go live with {config.name}?</h2>
            </div>
          </div>
          <Button variant="ghost" size="icon" aria-label="Close go live dialog" onClick={onCancel}>
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>

        <p id="go-live-description" className="mt-5 text-sm leading-6 text-muted-foreground">
          Live mode allows Perfexa to read this account for reporting. This pilot cannot create, pause, resume, or change campaigns or spend.
        </p>

        <div className="mt-5 rounded-2xl border border-amber-500/30 bg-amber-500/8 p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-amber-800 dark:text-amber-200">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            This is a deliberate safety check
          </div>
          <p className="mt-1.5 text-xs leading-5 text-amber-800/80 dark:text-amber-200/80">Type LIVE below to confirm read-only access to real account data.</p>
        </div>

        <div className="mt-5 space-y-2">
          <Label htmlFor="live-confirmation">Confirmation</Label>
          <Input
            id="live-confirmation"
            autoFocus
            value={confirmText}
            onChange={(event) => onConfirmTextChange(event.target.value)}
            placeholder="Type LIVE"
            autoComplete="off"
            spellCheck={false}
            aria-invalid={Boolean(error)}
          />
          {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
        </div>

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={onCancel} disabled={pending}>Cancel</Button>
          <Button variant="destructive" onClick={onConfirm} disabled={!canConfirm || pending}>
            {pending ? 'Switching…' : 'Confirm live mode'}
            {!pending && <Check className="h-4 w-4" aria-hidden="true" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
