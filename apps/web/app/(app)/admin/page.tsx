'use client';

import { Activity, CircleAlert, CircleCheck, CircleX, FileText, Radio, UsersRound } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { MetricCard, PageHeader, PageShell } from '@/components/page-shell';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const PLAN_STYLES = {
  starter: 'border-slate-400/30 bg-slate-400/10 text-slate-600 dark:text-slate-300',
  growth: 'border-cyan-400/30 bg-cyan-400/10 text-cyan-700 dark:text-cyan-300',
  agency: 'border-violet-400/30 bg-violet-400/10 text-violet-700 dark:text-violet-300',
} as const;

const STATUS_STYLES = {
  healthy: {
    label: 'Healthy',
    dot: 'bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.8)]',
    icon: CircleCheck,
  },
  attention: {
    label: 'Needs attention',
    dot: 'bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.8)]',
    icon: CircleAlert,
  },
  critical: {
    label: 'At risk',
    dot: 'bg-rose-400 shadow-[0_0_10px_rgba(251,113,133,0.8)]',
    icon: CircleX,
  },
} as const;

function formatDate(value: Date | string | null | undefined): string {
  if (!value) return 'Not yet';
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value));
}

function formatCount(value: number, singular: string, plural = `${singular}s`): string {
  return `${value} ${value === 1 ? singular : plural}`;
}

export default function AdminPage() {
  const overview = trpc.admin.orgsOverview.useQuery();
  const users = trpc.admin.users.useQuery();
  const health = trpc.admin.health.useQuery();
  const orgs = overview.data ?? [];
  const overviewUnavailable = overview.isLoading || Boolean(overview.error);
  const activeSince = Date.now() - WEEK_MS;
  const connectedOrgs = orgs.filter((org) => org.liveConnections > 0).length;
  const activeThisWeek = orgs.filter(
    (org) => org.lastActiveAt && new Date(org.lastActiveAt).getTime() >= activeSince,
  ).length;
  const totalLiveConnections = orgs.reduce((total, org) => total + org.liveConnections, 0);

  return (
    <PageShell className="space-y-7">
      <PageHeader
        eyebrow="Pilot operations"
        title="Organization health"
        description="A live read on every design-partner org, its connections, and weekly reporting rhythm."
        actions={
          <Badge variant="outline" className="gap-2 border-cyan-400/25 bg-cyan-400/10 text-cyan-700 dark:text-cyan-300">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-400" aria-hidden="true" />
            Operator view
          </Badge>
        }
      />

      <section className="grid gap-3 sm:grid-cols-3" aria-label="Pilot cohort summary">
        <MetricCard
          label="Organizations"
          value={overviewUnavailable ? '—' : orgs.length}
          detail={overviewUnavailable ? 'Unavailable right now' : orgs.length ? 'Across the current pilot cohort' : 'No organizations onboarded'}
        />
        <MetricCard
          label="Connected orgs"
          value={overviewUnavailable ? '—' : connectedOrgs}
          detail={overviewUnavailable ? 'Unavailable right now' : `${formatCount(totalLiveConnections, 'live connection')}`}
        />
        <MetricCard
          label="Active this week"
          value={overviewUnavailable ? '—' : activeThisWeek}
          detail={overviewUnavailable ? 'Unavailable right now' : 'Recent operator or report activity'}
        />
      </section>

      <Card className="overflow-hidden">
        <CardHeader className="border-b border-[color:var(--glass-divider)] pb-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Activity className="h-4 w-4 text-primary" aria-hidden="true" />
                Pilot cohort
              </CardTitle>
              <CardDescription className="mt-1">Prioritize follow-up by connection, report, and activity signals.</CardDescription>
            </div>
            {overview.data && <Badge variant="secondary">{formatCount(orgs.length, 'organization')}</Badge>}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {overview.isLoading && <p className="px-6 py-12 text-center text-sm text-muted-foreground">Loading organization health…</p>}
          {overview.error && (
            <div className="px-6 py-12 text-center">
              <CircleX className="mx-auto h-5 w-5 text-destructive" aria-hidden="true" />
              <p className="mt-2 text-sm font-medium">Could not load organization health.</p>
              <p className="mt-1 text-xs text-muted-foreground">Refresh the page and try again.</p>
            </div>
          )}
          {!overview.isLoading && !overview.error && orgs.length === 0 && (
            <div className="px-6 py-14 text-center">
              <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl border border-[color:var(--glass-border)] bg-[color:var(--glass-bg-subtle)]">
                <UsersRound className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
              </div>
              <p className="mt-4 text-sm font-medium">No organizations yet</p>
              <p className="mt-1 text-xs text-muted-foreground">New pilot organizations will appear here after onboarding.</p>
            </div>
          )}
          {!overview.isLoading && !overview.error && orgs.length > 0 && (
            <Table className="min-w-[760px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Organization</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Live connections</TableHead>
                  <TableHead>Last report</TableHead>
                  <TableHead>Last active</TableHead>
                  <TableHead className="pr-6">Health</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orgs.map((org) => {
                  const status = STATUS_STYLES[org.status];
                  const StatusIcon = status.icon;
                  return (
                    <TableRow key={org.orgId}>
                      <TableCell className="pl-6">
                        <div className="min-w-[170px]">
                          <p className="font-medium">{org.name}</p>
                          <p className="mt-0.5 font-mono text-[0.65rem] text-muted-foreground">{org.orgId.slice(0, 8)}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={PLAN_STYLES[org.plan]}>
                          {org.plan}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 tabular-nums">
                          <Radio className={org.liveConnections > 0 ? 'h-3.5 w-3.5 text-emerald-400' : 'h-3.5 w-3.5 text-muted-foreground'} aria-hidden="true" />
                          <span>{org.liveConnections}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 whitespace-nowrap text-xs">
                          <FileText className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                          <span>{formatDate(org.lastReportAt)}</span>
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{formatDate(org.lastActiveAt)}</TableCell>
                      <TableCell className="pr-6">
                        <div className="flex items-center gap-2 whitespace-nowrap">
                          <span className={`h-2 w-2 rounded-full ${status.dot}`} title={status.label} aria-label={status.label} />
                          <StatusIcon className="h-3.5 w-3.5 sm:hidden" aria-hidden="true" />
                          <span className="hidden text-xs text-muted-foreground sm:inline">{status.label}</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base">System health</CardTitle>
            <CardDescription>Platform services supporting the pilot cohort.</CardDescription>
          </CardHeader>
          <CardContent>
            {health.data ? (
              <div className="flex flex-wrap gap-2">
                <Badge variant={health.data.db === 'ok' ? 'success' : 'destructive'}>db: {health.data.db}</Badge>
                <Badge variant={health.data.redis === 'ok' ? 'success' : 'warning'}>redis: {health.data.redis}</Badge>
                <Badge variant="secondary">llm: {health.data.llm}</Badge>
                <Badge variant="secondary">stt: {health.data.stt}</Badge>
                <Badge variant="secondary">tts: {health.data.tts}</Badge>
                {health.data.adapters.map((adapter) => (
                  <Badge key={adapter.platform} variant="outline">
                    {adapter.platform}: {adapter.mode} · {adapter.status}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Checking…</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base">User access</CardTitle>
            <CardDescription>Members across the organizations in view.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table className="min-w-[520px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Name</TableHead>
                  <TableHead>Organization</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="pr-6">Joined</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.isLoading && <TableRow><TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">Loading users…</TableCell></TableRow>}
                {users.error && <TableRow><TableCell colSpan={4} className="py-8 text-center text-sm text-destructive">Could not load users.</TableCell></TableRow>}
                {!users.isLoading && !users.error && !users.data?.length && <TableRow><TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">No users in view.</TableCell></TableRow>}
                {!users.isLoading && !users.error && users.data?.map((user) => (
                  <TableRow key={`${user.userId}-${user.orgId}`}>
                    <TableCell className="pl-6">
                      <p className="font-medium">{user.name ?? user.email ?? 'Unnamed user'}</p>
                      {user.name && <p className="text-xs text-muted-foreground">{user.email}</p>}
                    </TableCell>
                    <TableCell>{user.orgName ?? '—'}</TableCell>
                    <TableCell><Badge variant="secondary">{user.role}</Badge></TableCell>
                    <TableCell className="pr-6 text-xs text-muted-foreground">{formatDate(user.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}
