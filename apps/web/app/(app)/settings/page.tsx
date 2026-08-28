'use client';

// Settings (CONTRACTS §10): integrations (sandbox/live with LIVE confirm),
// budgets (>20% change → approval), team, notifications, billing placeholder.

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageShell, PageHeader } from '@/components/page-shell';
import { ModelSelectorCard } from '@/components/model-selector';
import { cn } from '@/lib/utils';
import {
  GoLiveDialog,
  IntegrationPlatformCard,
  type IntegrationPlatform,
  type IntegrationRecord,
} from '@/components/integrations-platform-card';

const PLATFORM_LABELS: Record<string, string> = {
  google_ads: 'Google Ads',
  meta: 'Meta',
  tiktok: 'TikTok',
  ga4: 'Google Analytics 4',
  gsc: 'Search Console',
};

export default function SettingsPage() {
  return (
    <PageShell className="space-y-4">
      <PageHeader
        eyebrow="Configuration"
        title="Settings"
        description="Manage ad platform integrations, hard budget caps, team members, and notification preferences."
      />
      <Tabs defaultValue="brand">
        <TabsList>
          <TabsTrigger value="brand">Brand DNA</TabsTrigger>
          <TabsTrigger value="integrations">Integrations</TabsTrigger>
          <TabsTrigger value="models">AI Model</TabsTrigger>
          <TabsTrigger value="aiUsage">AI Usage</TabsTrigger>
          <TabsTrigger value="budgets">Budgets</TabsTrigger>
          <TabsTrigger value="team">Team</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="billing">Billing</TabsTrigger>
        </TabsList>
        <TabsContent value="brand">
          <BrandDNATab />
        </TabsContent>
        <TabsContent value="integrations">
          <IntegrationsTab />
        </TabsContent>
        <TabsContent value="models">
          <ModelSelectorCard />
        </TabsContent>
        <TabsContent value="aiUsage">
          <AiUsageTab />
        </TabsContent>
        <TabsContent value="budgets">
          <BudgetsTab />
        </TabsContent>
        <TabsContent value="team">
          <TeamTab />
        </TabsContent>
        <TabsContent value="notifications">
          <NotificationsTab />
        </TabsContent>
        <TabsContent value="billing">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Billing</CardTitle>
              <CardDescription>
                Billing is coming soon. During the beta, GrowthCrew is free — ad spend goes directly
                to the ad platforms, never through us.
              </CardDescription>
            </CardHeader>
          </Card>
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}

/** Result banner after the OAuth round-trip (?connected= / ?error=). */
function BrandDNATab() {
  const utils = trpc.useUtils();
  const brand = trpc.settings.brand.get.useQuery();
  const update = trpc.settings.brand.update.useMutation({
    onSuccess: () => {
      utils.settings.brand.invalidate();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  const profile = (brand.data ?? {}) as Record<string, unknown>;
  const [form, setForm] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  // Sync server → local on load
  const str = (v: unknown) => (typeof v === 'string' ? v : Array.isArray(v) ? v.join('\n') : '');
  const fields: Array<{ key: string; label: string; hint: string; multiline?: boolean }> = [
    { key: 'companyName', label: 'Company name', hint: 'What the AI should call you.' },
    { key: 'tagline', label: 'Tagline', hint: 'One line that captures the brand.' },
    { key: 'industry', label: 'Industry', hint: 'Sector and niche.' },
    { key: 'targetAudience', label: 'Target audience', hint: 'Who you sell to — regions, demographics, psychographics.', multiline: true },
    { key: 'voiceTone', label: 'Voice & tone', hint: 'How the brand sounds. e.g. "confident, plain-spoken, never salesy".', multiline: true },
    { key: 'usp', label: 'Unique selling point', hint: 'The one thing you do better than anyone.', multiline: true },
    { key: 'doList', label: 'Always do', hint: 'One per line. Things the AI must lean into.', multiline: true },
    { key: 'dontList', label: 'Never do', hint: 'One per line. Hard guardrails for the AI.', multiline: true },
    { key: 'competitors', label: 'Competitors', hint: 'One per line. Who you watch.', multiline: true },
  ];

  const val = (key: string) => (form[key] !== undefined ? form[key] : str(profile[key]));

  const handleSave = () => {
    const payload: Record<string, unknown> = {};
    for (const f of fields) {
      const raw = val(f.key).trim();
      if (!raw) continue;
      payload[f.key] = f.multiline && ['doList', 'dontList', 'competitors'].includes(f.key)
        ? raw.split('\n').map((s) => s.trim()).filter(Boolean)
        : raw;
    }
    update.mutate(payload as never);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-base">
          Brand DNA
          <Button size="sm" onClick={handleSave} disabled={update.isPending}>
            {saved ? 'Saved ✓' : update.isPending ? 'Saving…' : 'Save Brand DNA'}
          </Button>
        </CardTitle>
        <CardDescription>
          This is the ground truth your AI team writes from. The more specific you are, the more on-brand every
          campaign, alert, and report becomes.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5 sm:grid-cols-2">
        {fields.map((f) => (
          <div key={f.key} className={f.multiline ? 'sm:col-span-2' : ''}>
            <Label htmlFor={`brand-${f.key}`}>{f.label}</Label>
            {f.multiline ? (
              <textarea
                id={`brand-${f.key}`}
                value={val(f.key)}
                onChange={(e) => setForm((p) => ({ ...p, [f.key]: e.target.value }))}
                placeholder={f.hint}
                rows={3}
                className="glass-input mt-1.5 w-full rounded-xl px-3 py-2 text-sm placeholder:text-muted-foreground"
              />
            ) : (
              <Input
                id={`brand-${f.key}`}
                value={val(f.key)}
                onChange={(e) => setForm((p) => ({ ...p, [f.key]: e.target.value }))}
                placeholder={f.hint}
                className="mt-1.5"
              />
            )}
            <p className="mt-1 text-xs text-muted-foreground">{f.hint}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function OAuthNotice() {
  const params = useSearchParams();
  const connected = params.get('connected');
  const error = params.get('error');
  if (connected) {
    return (
      <p className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm">
        {PLATFORM_LABELS[connected] ?? connected} connected — the card below shows the connected account, and it&apos;s
        in sandbox mode. Switch to live when you&apos;re ready (you&apos;ll type LIVE to confirm).
      </p>
    );
  }
  if (error) {
    return <p className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">{error}</p>;
  }
  return null;
}

type ConnectionHealthRecord = {
  platform: IntegrationPlatform;
  mode: 'sandbox' | 'live';
  status: string;
  tokenExpiresAt: Date | string | null;
  tokenHealthy: boolean;
  lastSyncAt: Date | string | null;
  needsReconnect: boolean;
  warning?: string;
};

function asDate(value: Date | string | null): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatSyncAge(value: Date | string | null): string {
  const date = asDate(value);
  if (!date) return 'not synced yet';

  const minutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function IntegrationHealthRow({
  integration,
  health,
  loading,
  error,
}: {
  integration: IntegrationRecord;
  health?: ConnectionHealthRecord;
  loading: boolean;
  error: boolean;
}) {
  const tokenExpiresAt = asDate(health?.tokenExpiresAt ?? null);
  const expiring = Boolean(health?.needsReconnect && tokenExpiresAt && tokenExpiresAt.getTime() > Date.now());
  const tone =
    !health || loading || error ? 'neutral' : health.needsReconnect ? (expiring ? 'warning' : 'danger') : 'healthy';
  // Reconnect goes through the signed OAuth connect route. When this
  // deployment has no OAuth credentials for the platform there is no working
  // route — the card-level setup message is the actionable path instead, so
  // don't render a button that can only bounce back with an error.
  const reconnectUrl = integration.connectUrl;
  const label = loading
    ? 'Checking connection health…'
    : error
      ? 'Connection health unavailable'
      : health?.needsReconnect
        ? expiring
          ? 'Token expiring — reconnect soon'
          : 'Connection lost — reconnect'
        : health
          ? `Connected · synced ${formatSyncAge(health.lastSyncAt)}`
          : integration.connected
            ? 'Connected · sync status pending'
            : 'Not connected · connect to start syncing';

  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-between gap-2 rounded-2xl border px-4 py-2.5 text-xs',
        tone === 'healthy' && 'border-emerald-500/25 bg-emerald-500/8 text-emerald-700 dark:text-emerald-300',
        tone === 'warning' && 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
        tone === 'danger' && 'border-destructive/30 bg-destructive/8 text-destructive',
        tone === 'neutral' && 'border-[color:var(--glass-border)] bg-[color:var(--glass-bg-subtle)] text-muted-foreground',
      )}
      aria-live="polite"
    >
      <div className="flex min-w-0 items-center gap-2">
        <span
          className={cn(
            'h-2 w-2 shrink-0 rounded-full ring-4',
            tone === 'healthy' && 'bg-emerald-500 ring-emerald-500/10',
            tone === 'warning' && 'bg-amber-500 ring-amber-500/10',
            tone === 'danger' && 'bg-destructive ring-destructive/10',
            tone === 'neutral' && 'bg-muted-foreground/60 ring-muted-foreground/10',
          )}
          aria-hidden="true"
        />
        <span className="font-medium">{label}</span>
      </div>

      {health?.warning && health.needsReconnect && (
        <span className="basis-full leading-5 text-current/80">{health.warning}</span>
      )}

      {health?.needsReconnect && reconnectUrl && (
        <Button
          variant="outline"
          size="sm"
          asChild
          className="h-7 border-current/25 px-2.5 text-xs text-current hover:bg-current/10"
        >
          <a href={reconnectUrl}>Reconnect</a>
        </Button>
      )}
    </div>
  );
}

function IntegrationsTab() {
  const utils = trpc.useUtils();
  const integrations = trpc.settings.integrations.useQuery();
  const connectionHealth = trpc.settings.connectionHealth.useQuery(undefined, { refetchInterval: 60_000 });
  const [connecting, setConnecting] = useState<IntegrationPlatform | null>(null);
  const connect = trpc.settings.connect.useMutation({
    onSuccess: () => utils.settings.invalidate(),
    onSettled: () => setConnecting(null),
  });
  const setMode = trpc.settings.setMode.useMutation({
    onSuccess: () => {
      utils.settings.invalidate();
      setConfirming(null);
      setConfirmText('');
    },
  });
  const [confirming, setConfirming] = useState<IntegrationPlatform | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const syncNow = trpc.settings.syncNow.useMutation({
    onSuccess: (result) => {
      void utils.settings.invalidate();
      void utils.dashboard.invalidate();
      void utils.reports.invalidate();
      const failed = result.filter((row) => row.error);
      const synced = result.reduce((total, row) => total + row.synced, 0);
      setSyncMessage(
        failed.length
          ? `${synced} campaign${synced === 1 ? '' : 's'} refreshed. ${failed.length} platform${failed.length === 1 ? '' : 's'} need attention.`
          : `${synced} campaign${synced === 1 ? '' : 's'} refreshed from live accounts.`,
      );
    },
    onError: (error) => setSyncMessage(error.message),
  });

  const rows = (integrations.data ?? []) as IntegrationRecord[];
  const healthByPlatform = new Map(
    ((connectionHealth.data ?? []) as ConnectionHealthRecord[]).map((health) => [health.platform, health]),
  );
  const connectedCount = rows.filter((integration) => integration.connected).length;
  const liveConnected = rows.some(
    (integration) => integration.connected && integration.status === 'connected' && integration.mode === 'live',
  );

  if (integrations.isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2" aria-label="Loading integrations" aria-busy="true">
        {Array.from({ length: 5 }, (_, index) => (
          <Card key={index} className="h-[330px] animate-pulse bg-[color:var(--glass-bg-subtle)]" />
        ))}
      </div>
    );
  }

  if (integrations.error) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-destructive" role="alert">
          We couldn&apos;t load your integrations. {integrations.error.message}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <Suspense fallback={null}>
        <OAuthNotice />
      </Suspense>
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.15em] text-primary">Connected ecosystem</p>
          <h2 className="mt-1 font-display text-xl font-semibold tracking-tight">Bring every growth signal together.</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
            Start safely in sandbox mode, then move an account live only when you&apos;re ready. Each connection keeps your reporting and decisions grounded in the data that matters.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="w-fit shrink-0 px-3 py-1.5">
            {connectedCount} of {rows.length} connected
          </Badge>
          <Button
            variant="outline"
            size="sm"
            disabled={!liveConnected || syncNow.isPending}
            title={liveConnected ? 'Refresh campaigns from connected live accounts' : 'Connect and switch an account to live first'}
            onClick={() => syncNow.mutate({})}
          >
            <RefreshCw className={syncNow.isPending ? 'animate-spin' : ''} />
            {syncNow.isPending ? 'Syncing…' : 'Sync now'}
          </Button>
        </div>
      </div>

      {syncMessage && <p className="text-sm text-muted-foreground" role="status">{syncMessage}</p>}

      {connect.error && (
        <p className="rounded-xl border border-destructive/35 bg-destructive/5 p-3 text-sm text-destructive" role="alert">
          {connect.error.message}
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {rows.map((integration) => (
          <div key={integration.platform} className="space-y-2">
            <IntegrationPlatformCard
              integration={integration}
              connectPending={connecting === integration.platform && connect.isPending}
              setModePending={setMode.isPending}
              onConnect={() => {
                setConnecting(integration.platform);
                connect.mutate({ platform: integration.platform });
              }}
              onGoLive={() => {
                setMode.reset();
                setConfirming(integration.platform);
                setConfirmText('');
              }}
              onSwitchToSandbox={() => setMode.mutate({ platform: integration.platform, mode: 'sandbox' })}
            />
            <IntegrationHealthRow
              integration={integration}
              health={healthByPlatform.get(integration.platform)}
              loading={connectionHealth.isLoading}
              error={Boolean(connectionHealth.error)}
            />
          </div>
        ))}
      </div>

      {confirming && (
        <GoLiveDialog
          platform={confirming}
          confirmText={confirmText}
          error={setMode.error?.message}
          pending={setMode.isPending}
          onConfirmTextChange={setConfirmText}
          onConfirm={() => setMode.mutate({ platform: confirming, mode: 'live', confirmText })}
          onCancel={() => {
            setMode.reset();
            setConfirming(null);
            setConfirmText('');
          }}
        />
      )}
    </div>
  );
}

function BudgetsTab() {
  const utils = trpc.useUtils();
  const budgets = trpc.settings.budgets.list.useQuery();
  const update = trpc.settings.budgets.update.useMutation({
    onSuccess: (result) => {
      utils.settings.invalidate();
      utils.approvals.invalidate();
      setMessage(
        'applied' in result && !result.applied
          ? 'That’s a big change (more than 20%) — we created an approval request so you can confirm it deliberately.'
          : 'Budget updated.',
      );
    },
    onError: (e) => setMessage(e.message),
  });
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Budget caps</CardTitle>
        <CardDescription>
          Hard limits the Budget Guardian enforces. Changes over 20% need an explicit approval.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {(budgets.data ?? []).map((budget) => {
          const key = budget.id;
          const current = (budget.capCents ?? 0) / 100;
          return (
            <div key={key} className="flex flex-wrap items-center gap-3">
              <span className="w-48 text-sm">
                {budget.scope === 'global' ? 'Global' : PLATFORM_LABELS[budget.scope?.replace('platform:', '') ?? ''] ?? budget.scope}{' '}
                <span className="text-muted-foreground">({budget.period})</span>
              </span>
              <Input
                type="number"
                min={1}
                defaultValue={current}
                onChange={(e) => setDrafts((d) => ({ ...d, [key]: e.target.value }))}
                className="w-32"
              />
              <Button
                variant="outline"
                size="sm"
                disabled={update.isPending || !drafts[key] || Number(drafts[key]) === current}
                onClick={() =>
                  update.mutate({
                    scope: budget.scope!,
                    capCents: Math.round(Number(drafts[key]) * 100),
                    period: (budget.period ?? 'monthly') as 'daily' | 'monthly',
                  })
                }
              >
                Save
              </Button>
            </div>
          );
        })}
        {message && <p className="text-sm text-muted-foreground">{message}</p>}
        <PendingApprovals />
      </CardContent>
    </Card>
  );
}

function PendingApprovals() {
  const utils = trpc.useUtils();
  const pending = trpc.approvals.list.useQuery({ status: 'pending' });
  const decide = trpc.approvals.decide.useMutation({
    onSuccess: () => {
      utils.approvals.invalidate();
      utils.settings.invalidate();
      utils.campaigns.invalidate();
    },
  });
  if (!pending.data?.length) return null;
  return (
    <div className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
      <p className="text-xs uppercase text-amber-500">Waiting for your approval</p>
      {pending.data.map((a) => {
        const action = a.action as { summary?: string; toolName?: string } | null;
        return (
          <div key={a.id} className="flex items-center justify-between gap-2">
            <span className="text-sm">{action?.summary ?? action?.toolName ?? 'Action'}</span>
            <span className="flex gap-2">
              <Button size="sm" disabled={decide.isPending} onClick={() => decide.mutate({ id: a.id, approve: true })}>
                Approve
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={decide.isPending}
                onClick={() => decide.mutate({ id: a.id, approve: false })}
              >
                Reject
              </Button>
            </span>
          </div>
        );
      })}
    </div>
  );
}

function TeamTab() {
  const utils = trpc.useUtils();
  const members = trpc.settings.members.list.useQuery();
  const invite = trpc.settings.members.invite.useMutation({
    onSuccess: (r) => setNote(r.message),
    onError: (e) => setNote(e.message),
  });
  const remove = trpc.settings.members.remove.useMutation({
    onSuccess: () => utils.settings.invalidate(),
  });
  const [email, setEmail] = useState('');
  const [note, setNote] = useState<string | null>(null);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Team members</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {(members.data ?? []).map((m) => (
          <div key={m.id} className="flex items-center justify-between">
            <span className="text-sm">
              {m.name ?? m.email} <Badge variant="secondary">{m.role}</Badge>
            </span>
            {m.role !== 'owner' && (
              <Button variant="ghost" size="sm" disabled={remove.isPending} onClick={() => remove.mutate({ id: m.id })}>
                Remove
              </Button>
            )}
          </div>
        ))}
        <div className="flex gap-2">
          <Label htmlFor="invite-email" className="sr-only">
            Email
          </Label>
          <Input
            id="invite-email"
            type="email"
            placeholder="teammate@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="max-w-xs"
          />
          <Button
            variant="outline"
            size="sm"
            disabled={!email || invite.isPending}
            onClick={() => invite.mutate({ email })}
          >
            Invite
          </Button>
        </div>
        {note && <p className="text-sm text-muted-foreground">{note}</p>}
      </CardContent>
    </Card>
  );
}

function NotificationsTab() {
  const me = trpc.auth.me.useQuery();
  const update = trpc.settings.notifications.update.useMutation();
  const stored = ((me.data?.org?.settings as Record<string, unknown> | undefined)?.notifications ?? {}) as Record<string, boolean>;
  const [prefs, setPrefs] = useState<Record<string, boolean> | null>(null);
  const current = prefs ?? {
    weeklyReport: stored.weeklyReport ?? true,
    guardianAlerts: stored.guardianAlerts ?? true,
    newLeads: stored.newLeads ?? true,
  };

  function toggle(key: string, value: boolean) {
    const next = { ...current, [key]: value };
    setPrefs(next);
    update.mutate({ prefs: next });
  }

  const rows = [
    { key: 'weeklyReport', label: 'Weekly performance report (email)' },
    { key: 'guardianAlerts', label: 'Budget Guardian alerts' },
    { key: 'newLeads', label: 'New lead notifications' },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Notifications</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.map((row) => (
          <div key={row.key} className="flex items-center justify-between">
            <span className="text-sm">{row.label}</span>
            <Switch checked={current[row.key] ?? true} onCheckedChange={(v) => toggle(row.key, v)} />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function AiUsageTab() {
  const utils = trpc.useUtils();
  const { data: stats, isLoading } = trpc.settings.aiUsage.stats.useQuery();
  const [budgetInput, setBudgetInput] = useState('');
  const setBudget = trpc.settings.aiUsage.setBudget.useMutation({
    onSuccess: () => {
      utils.settings.aiUsage.stats.invalidate();
      setBudgetInput('');
    },
  });

  if (isLoading) return <Card><CardContent className="pt-6 text-sm text-muted-foreground">Loading usage data…</CardContent></Card>;
  if (!stats) return null;

  const usedDollars = (stats.estimatedCostCents / 100).toFixed(2);
  const budgetDollars = (stats.budgetCents / 100).toFixed(2);
  const remainingDollars = (stats.remainingCents / 100).toFixed(2);
  const pctColor = stats.pctUsed >= 90 ? 'bg-red-500' : stats.pctUsed >= 70 ? 'bg-amber-500' : 'bg-emerald-500';

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">AI Usage — {stats.month}</CardTitle>
          <CardDescription>
            Token consumption and estimated cost for AI conversations this month. Deterministic engines (alerts, fatigue, competitor intel) run at zero AI cost and are never throttled.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Usage bar */}
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span>${usedDollars} used</span>
              <span>${budgetDollars} budget</span>
            </div>
            <div className="h-3 rounded-full bg-muted overflow-hidden">
              <div className={`h-full rounded-full ${pctColor} transition-all`} style={{ width: `${Math.min(100, stats.pctUsed)}%` }} />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {stats.pctUsed}% used · ${remainingDollars} remaining · {stats.requestCount} requests · {(stats.totalTokens / 1000).toFixed(1)}K tokens
            </p>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: 'Prompt tokens', value: stats.promptTokens.toLocaleString() },
              { label: 'Completion tokens', value: stats.completionTokens.toLocaleString() },
              { label: 'Requests', value: String(stats.requestCount) },
              { label: 'Est. cost', value: `$${usedDollars}` },
            ].map((s) => (
              <div key={s.label} className="rounded-lg border p-3 text-center">
                <p className="text-lg font-semibold">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Monthly AI Budget</CardTitle>
          <CardDescription>
            When usage reaches this cap, AI conversations pause until next month. Deterministic engines keep running. Recommended: $4.60 (Starter), $12 (Growth), $25 (Agency).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-3">
            <div className="space-y-1">
              <Label htmlFor="ai-budget">Budget (USD/month)</Label>
              <Input
                id="ai-budget"
                type="number"
                min="1"
                max="1000"
                step="0.50"
                placeholder={(stats.budgetCents / 100).toFixed(2)}
                value={budgetInput}
                onChange={(e) => setBudgetInput(e.target.value)}
                className="w-32"
              />
            </div>
            <Button
              onClick={() => {
                const cents = Math.round(parseFloat(budgetInput) * 100);
                if (cents >= 100) setBudget.mutate({ cents });
              }}
              disabled={!budgetInput || setBudget.isPending}
            >
              {setBudget.isPending ? 'Saving…' : 'Update budget'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
