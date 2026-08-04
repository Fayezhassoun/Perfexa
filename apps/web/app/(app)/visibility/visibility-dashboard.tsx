'use client';

// AI Visibility (GEO) dashboard — Phase 1 surface.
// Honesty rail in the UI: engines are only ever shown as "live" when the
// latest run actually queried them; ChatGPT is labeled "soon"; anything
// without stored data renders an empty state — never simulated numbers.

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Check,
  Copy,
  ExternalLink,
  Lightbulb,
  Loader2,
  Play,
  Plus,
  Radar,
  Trash2,
  X,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { MetricCard, PageHeader, PageShell, StatusChip } from '@/components/page-shell';
import { cn } from '@/lib/utils';

// ── API payload types (mirror services/geo.ts) ─────────────────────────────

interface GeoCitation {
  title?: string;
  url: string;
}
interface GeoCompetitorMention {
  name: string;
  count: number;
}
interface GeoPrompt {
  id: string;
  text: string;
  category: string | null;
  active: boolean;
}
interface GeoResult {
  id: string;
  engine: 'perplexity' | 'gemini';
  brandMentioned: boolean;
  brandRank: number | null;
  answerExcerpt: string | null;
  citations: GeoCitation[];
  competitorMentions: GeoCompetitorMention[];
  sentiment: 'positive' | 'neutral' | 'negative' | null;
  parseFailed: boolean;
}
interface EngineSummary {
  engine: 'perplexity' | 'gemini';
  status: 'ok' | 'failed';
  error?: string;
  prompts: number;
  mentions: number;
  visibility: number | null;
}
interface RunSummaryPrompt {
  prompt: GeoPrompt;
  results: Partial<Record<'perplexity' | 'gemini', GeoResult | undefined>>;
  mentionedAnywhere: boolean;
}
interface RunSummary {
  run: {
    id: string;
    status: string;
    trigger: string;
    engines: Partial<Record<'perplexity' | 'gemini', { status: 'ok' | 'failed'; error?: string }>>;
    error: string | null;
    createdAt: string;
    finishedAt: string | null;
  };
  visibilityCombined: number | null;
  shareOfVoice: number | null;
  brandMentions: number;
  competitorMentions: number;
  engines: EngineSummary[];
  prompts: RunSummaryPrompt[];
}
interface GeoConfig {
  perplexityConfigured: boolean;
  geminiConfigured: boolean;
  chatgpt: 'soon';
}
interface LatestPayload {
  run: RunSummary | null;
  prompts: GeoPrompt[];
  config: GeoConfig;
}
interface HistoryPoint {
  runId: string;
  createdAt: string;
  status: string;
  visibilityCombined: number | null;
}
interface GeoBrief {
  title: string;
  outline: string[];
  target_queries: string[];
}

const ENGINE_LABELS: Record<string, string> = {
  perplexity: 'Perplexity',
  gemini: 'Gemini',
  chatgpt: 'ChatGPT',
};

// Suggested starter prompts — placeholders only, never saved unless the user adds them.
const SUGGESTED_PROMPTS = [
  'What is the best CRM for small businesses?',
  'Which project management tool should a startup use?',
  'Who offers the best accounting services near me?',
  'What is the most reliable e-commerce platform?',
];

async function geoFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { 'content-type': 'application/json' },
    ...init,
  });
  const data = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok) {
    throw new Error(data?.error ?? `Request failed (${res.status})`);
  }
  return data as T;
}

function pct(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return `${Math.round(value * 100)}%`;
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export function VisibilityDashboard() {
  const [latest, setLatest] = useState<LatestPayload | null>(null);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [newPrompt, setNewPrompt] = useState('');
  const [promptBusy, setPromptBusy] = useState(false);
  const [scanBusy, setScanBusy] = useState(false);

  const [drawer, setDrawer] = useState<RunSummaryPrompt | null>(null);
  const [briefFor, setBriefFor] = useState<GeoPrompt | null>(null);
  const [brief, setBrief] = useState<GeoBrief | null>(null);
  const [briefBusy, setBriefBusy] = useState(false);
  const [briefError, setBriefError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(async () => {
    const [latestRes, historyRes] = await Promise.all([
      geoFetch<LatestPayload>('/api/geo/latest'),
      geoFetch<{ history: HistoryPoint[] }>('/api/geo/history'),
    ]);
    setLatest(latestRes);
    setHistory(historyRes.history);
  }, []);

  useEffect(() => {
    refresh()
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load visibility data'))
      .finally(() => setLoading(false));
  }, [refresh]);

  const runScan = useCallback(async () => {
    setScanBusy(true);
    setError(null);
    setNotice(null);
    try {
      await geoFetch('/api/geo/scan', { method: 'POST' });
      setNotice('Scan complete — results are in.');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Scan failed');
    } finally {
      setScanBusy(false);
    }
  }, [refresh]);

  const addPrompt = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      setPromptBusy(true);
      setError(null);
      try {
        await geoFetch('/api/geo/prompts', {
          method: 'POST',
          body: JSON.stringify({ text: trimmed }),
        });
        setNewPrompt('');
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to add prompt');
      } finally {
        setPromptBusy(false);
      }
    },
    [refresh],
  );

  const deletePrompt = useCallback(
    async (id: string) => {
      setError(null);
      try {
        await geoFetch(`/api/geo/prompts?id=${id}`, { method: 'DELETE' });
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to remove prompt');
      }
    },
    [refresh],
  );

  const openBrief = useCallback(async (prompt: GeoPrompt) => {
    setBriefFor(prompt);
    setBrief(null);
    setBriefError(null);
    setCopied(false);
    setBriefBusy(true);
    try {
      const res = await geoFetch<{ brief: GeoBrief }>('/api/geo/briefs', {
        method: 'POST',
        body: JSON.stringify({ promptId: prompt.id }),
      });
      setBrief(res.brief);
    } catch (err) {
      setBriefError(err instanceof Error ? err.message : 'Brief generation failed');
    } finally {
      setBriefBusy(false);
    }
  }, []);

  const closeBrief = useCallback(() => {
    setBriefFor(null);
    setBrief(null);
    setBriefError(null);
  }, []);

  const copyBrief = useCallback(async () => {
    if (!brief || !briefFor) return;
    const text = [
      `Content brief: ${brief.title}`,
      '',
      `Gap: "${briefFor.text}" — the brand is absent from AI answers where competitors get cited.`,
      '',
      'Outline:',
      ...brief.outline.map((line) => `- ${line}`),
      '',
      'Target queries:',
      ...brief.target_queries.map((q) => `- ${q}`),
    ].join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setBriefError('Could not copy — select the text manually.');
    }
  }, [brief, briefFor]);

  // ── Derived data ──────────────────────────────────────────────────────────

  const activePrompts = useMemo(
    () => (latest?.prompts ?? []).filter((p) => p.active),
    [latest],
  );

  const competitorTotals = useMemo(() => {
    const totals = new Map<string, number>();
    for (const row of latest?.run?.prompts ?? []) {
      for (const result of Object.values(row.results)) {
        for (const mention of result?.competitorMentions ?? []) {
          totals.set(mention.name, (totals.get(mention.name) ?? 0) + mention.count);
        }
      }
    }
    return [...totals.entries()].sort((a, b) => b[1] - a[1]);
  }, [latest]);

  const trend = useMemo(
    () =>
      history
        .filter((h) => h.visibilityCombined !== null)
        .map((h, i) => ({
          idx: i + 1,
          label: new Date(h.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
          visibility: Math.round((h.visibilityCombined ?? 0) * 100),
        })),
    [history],
  );

  if (loading) {
    return (
      <PageShell className="space-y-6" data-testid="visibility">
        <PageHeader eyebrow="GEO" title="AI Visibility" description="Loading…" />
      </PageShell>
    );
  }

  const run = latest?.run ?? null;
  const config = latest?.config;

  return (
    <PageShell className="space-y-6" data-testid="visibility">
      <PageHeader
        eyebrow="GEO"
        title="AI Visibility"
        description="Is your brand cited when AI engines answer the questions your customers ask?"
        actions={
          <div className="flex items-center gap-2">
            {run && (
              <span className="text-xs text-muted-foreground">
                Last scan {new Date(run.run.createdAt).toLocaleString()}
              </span>
            )}
            <Button onClick={runScan} disabled={scanBusy || activePrompts.length === 0} data-testid="run-scan">
              {scanBusy ? <Loader2 className="animate-spin" /> : <Play />}
              {scanBusy ? 'Scanning engines…' : run ? 'Run scan' : 'Run first scan'}
            </Button>
          </div>
        }
      />

      {(error || notice) && (
        <div
          className={cn(
            'glass-panel flex items-center justify-between gap-3 px-4 py-3 text-sm',
            error ? 'border-red-500/30 text-red-600 dark:text-red-400' : 'border-emerald-500/30 text-emerald-600 dark:text-emerald-400',
          )}
          role="status"
        >
          <span>{error ?? notice}</span>
          <button
            type="button"
            aria-label="Dismiss"
            className="text-muted-foreground hover:text-foreground"
            onClick={() => {
              setError(null);
              setNotice(null);
            }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Empty state 1: no prompts yet → prompt management */}
      {activePrompts.length === 0 ? (
        <PromptManager
          prompts={[]}
          newPrompt={newPrompt}
          setNewPrompt={setNewPrompt}
          onAdd={() => addPrompt(newPrompt)}
          onDelete={deletePrompt}
          busy={promptBusy}
          autoFocus
        />
      ) : (
        <>
          {/* Header metrics: combined score + per-engine chips */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="visibility-kpis">
            <MetricCard
              label="Visibility score"
              value={pct(run?.visibilityCombined ?? null)}
              detail="Share of tracked prompts where AI engines cite you"
            />
            <MetricCard
              label="Share of voice"
              value={pct(run?.shareOfVoice ?? null)}
              detail="Your mentions vs competitor mentions"
            />
            <MetricCard label="Brand mentions" value={run ? String(run.brandMentions) : '—'} />
            <MetricCard label="Competitor mentions" value={run ? String(run.competitorMentions) : '—'} />
          </div>

          <div className="flex flex-wrap items-center gap-2" data-testid="engine-chips">
            <EngineChip engine="perplexity" run={run} configured={config?.perplexityConfigured ?? false} />
            <EngineChip engine="gemini" run={run} configured={config?.geminiConfigured ?? false} />
            {/* Honesty rail: no real ChatGPT access path exists yet — never shown as tracked. */}
            <StatusChip>
              {ENGINE_LABELS.chatgpt} <Badge variant="secondary">soon</Badge>
            </StatusChip>
          </div>

          {/* Empty state 2: prompts exist but no run yet */}
          {!run && (
            <Card className="border-primary/25 bg-primary/[0.05]" data-testid="first-scan-card">
              <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
                <div className="glass-chip flex h-12 w-12 items-center justify-center rounded-2xl text-primary">
                  <Radar className="h-6 w-6" />
                </div>
                <p className="font-medium">Ready for your first scan</p>
                <p className="max-w-md text-sm text-muted-foreground">
                  GrowthCrew will ask Perplexity and Gemini your {activePrompts.length} tracked{' '}
                  {activePrompts.length === 1 ? 'question' : 'questions'} and record where your brand
                  shows up. Only real engine answers are stored.
                </p>
                <Button onClick={runScan} disabled={scanBusy}>
                  {scanBusy ? <Loader2 className="animate-spin" /> : <Play />}
                  {scanBusy ? 'Scanning engines…' : 'Run first scan'}
                </Button>
              </CardContent>
            </Card>
          )}

          {run && (
            <>
              <div className="grid gap-6 lg:grid-cols-2">
                {/* Share of voice bar */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Share of voice</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {run.brandMentions + run.competitorMentions > 0 ? (
                      <>
                        <div className="flex h-3 w-full overflow-hidden rounded-full bg-foreground/10">
                          <div
                            className="bg-primary"
                            style={{ width: `${(run.shareOfVoice ?? 0) * 100}%` }}
                          />
                          {competitorTotals.slice(0, 5).map(([, count], i) => (
                            <div
                              key={i}
                              className={cn(
                                i % 2 === 0 ? 'bg-amber-500/70' : 'bg-slate-400/70',
                              )}
                              style={{
                                width: `${(count / (run.brandMentions + run.competitorMentions)) * 100}%`,
                              }}
                            />
                          ))}
                        </div>
                        <div className="flex flex-wrap gap-2 text-xs">
                          <Badge>You {pct(run.shareOfVoice)}</Badge>
                          {competitorTotals.slice(0, 5).map(([name, count]) => (
                            <Badge key={name} variant="outline">
                              {name}{' '}
                              {pct(count / (run.brandMentions + run.competitorMentions))}
                            </Badge>
                          ))}
                        </div>
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        No mentions captured yet — run a scan to compare against competitors.
                      </p>
                    )}
                  </CardContent>
                </Card>

                {/* Trend sparkline */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Visibility trend (last {history.length} runs)</CardTitle>
                  </CardHeader>
                  <CardContent className="h-40">
                    {trend.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={trend}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                          <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                          <YAxis
                            stroke="hsl(var(--muted-foreground))"
                            fontSize={11}
                            domain={[0, 100]}
                            unit="%"
                            width={40}
                          />
                          <Tooltip
                            contentStyle={{
                              background: 'var(--glass-bg-strong)',
                              backdropFilter: 'blur(16px) saturate(180%)',
                              WebkitBackdropFilter: 'blur(16px) saturate(180%)',
                              border: '1px solid var(--glass-border-strong)',
                              borderRadius: 12,
                              boxShadow: 'var(--glass-shadow)',
                              color: 'hsl(var(--foreground))',
                            }}
                            formatter={(value) => [`${value}%`, 'Visibility']}
                          />
                          <Line
                            type="monotone"
                            dataKey="visibility"
                            stroke="hsl(224 88% 56%)"
                            strokeWidth={2}
                            dot
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                        Not enough runs yet — the trend appears as scans accumulate.
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Per-prompt table */}
              <Card data-testid="prompt-results">
                <CardHeader>
                  <CardTitle className="text-base">Per-prompt results</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Prompt</TableHead>
                        <TableHead>Perplexity</TableHead>
                        <TableHead>Gemini</TableHead>
                        <TableHead>Top cited domains</TableHead>
                        <TableHead>Sentiment</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {run.prompts.map((row) => (
                        <PromptRow
                          key={row.prompt.id}
                          row={row}
                          onOpen={() => setDrawer(row)}
                          onBrief={() => openBrief(row.prompt)}
                        />
                      ))}
                    </TableBody>
                  </Table>
                  <p className="mt-3 text-xs text-muted-foreground">
                    Click a row for the answer excerpts and citations captured in the latest scan.
                  </p>
                </CardContent>
              </Card>
            </>
          )}

          {/* Prompt management (add more / remove) */}
          <PromptManager
            prompts={activePrompts}
            newPrompt={newPrompt}
            setNewPrompt={setNewPrompt}
            onAdd={() => addPrompt(newPrompt)}
            onDelete={deletePrompt}
            busy={promptBusy}
          />
        </>
      )}

      {/* Row drawer: answer excerpts + citations */}
      {drawer && <ResultDrawer row={drawer} onClose={() => setDrawer(null)} />}

      {/* Brief modal */}
      {briefFor && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Content brief">
          <button
            type="button"
            aria-label="Close brief"
            onClick={closeBrief}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
          />
          <div className="liquid-shell absolute inset-x-2 bottom-2 top-10 mx-auto max-w-2xl overflow-y-auto rounded-2xl p-6 animate-fade-up sm:top-20">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Lightbulb className="h-4 w-4 text-primary" />
                <span className="font-display text-sm font-semibold">Close the gap</span>
              </div>
              <button
                type="button"
                onClick={closeBrief}
                aria-label="Close"
                className="btn-glass flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mb-4 text-sm text-muted-foreground">
              &ldquo;{briefFor.text}&rdquo; — a content brief to make your brand the natural citation.
            </p>
            {briefBusy && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Drafting brief…
              </p>
            )}
            {briefError && <p className="text-sm text-red-600 dark:text-red-400">{briefError}</p>}
            {brief && (
              <div className="space-y-4">
                <h3 className="font-display text-lg font-semibold">{brief.title}</h3>
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Outline
                  </p>
                  <ul className="list-disc space-y-1 pl-5 text-sm">
                    {brief.outline.map((line, i) => (
                      <li key={i}>{line}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Target queries
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {brief.target_queries.map((q, i) => (
                      <Badge key={i} variant="outline">
                        {q}
                      </Badge>
                    ))}
                  </div>
                </div>
                <Button onClick={copyBrief}>
                  {copied ? <Check /> : <Copy />} {copied ? 'Copied' : 'Copy brief'}
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </PageShell>
  );
}

// ── Subcomponents ───────────────────────────────────────────────────────────

function EngineChip({
  engine,
  run,
  configured,
}: {
  engine: 'perplexity' | 'gemini';
  run: RunSummary | null;
  configured: boolean;
}) {
  const meta = run?.run.engines?.[engine];
  const summary = run?.engines.find((e) => e.engine === engine);

  let body: React.ReactNode;
  if (meta?.status === 'ok') {
    body = (
      <>
        {ENGINE_LABELS[engine]} <Badge variant="success">live ✓</Badge>
        {summary?.visibility !== null && summary?.visibility !== undefined && (
          <span className="text-xs text-muted-foreground">{pct(summary.visibility)}</span>
        )}
      </>
    );
  } else if (meta?.status === 'failed') {
    body = (
      <>
        {ENGINE_LABELS[engine]}{' '}
        <Badge variant="warning" title={meta.error}>
          failed
        </Badge>
      </>
    );
  } else if (run) {
    body = <>{ENGINE_LABELS[engine]} <Badge variant="secondary">not queried</Badge></>;
  } else if (configured) {
    body = <>{ENGINE_LABELS[engine]} <Badge variant="secondary">ready</Badge></>;
  } else {
    body = <>{ENGINE_LABELS[engine]} <Badge variant="secondary">needs API key</Badge></>;
  }
  return <StatusChip>{body}</StatusChip>;
}

function MentionCell({ result }: { result: GeoResult | undefined }) {
  if (!result) return <span className="text-muted-foreground">—</span>;
  if (result.parseFailed) {
    return (
      <span className="text-muted-foreground" title="The engine answered but parsing failed">
        ✗ <span className="text-xs">(parse error)</span>
      </span>
    );
  }
  if (result.brandMentioned) {
    return (
      <span className="font-medium text-emerald-600 dark:text-emerald-400">
        ✓{result.brandRank ? <span className="ml-1 text-xs">#{result.brandRank}</span> : null}
      </span>
    );
  }
  return <span className="text-muted-foreground">✗</span>;
}

function SentimentDot({ sentiment }: { sentiment: GeoResult['sentiment'] | undefined }) {
  if (!sentiment) return <span className="text-muted-foreground">—</span>;
  const color =
    sentiment === 'positive' ? 'bg-emerald-500' : sentiment === 'neutral' ? 'bg-amber-500' : 'bg-red-500';
  return (
    <span className="inline-flex items-center gap-1.5 capitalize">
      <span className={cn('h-2 w-2 rounded-full', color)} />
      {sentiment}
    </span>
  );
}

function PromptRow({
  row,
  onOpen,
  onBrief,
}: {
  row: RunSummaryPrompt;
  onOpen: () => void;
  onBrief: () => void;
}) {
  const results = Object.values(row.results).filter((r): r is GeoResult => Boolean(r));
  const domainCounts = new Map<string, number>();
  for (const result of results) {
    for (const citation of result.citations ?? []) {
      const host = hostnameOf(citation.url);
      domainCounts.set(host, (domainCounts.get(host) ?? 0) + 1);
    }
  }
  const topDomains = [...domainCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2);
  const competitorsCited = results.some((r) => (r.competitorMentions ?? []).length > 0);
  const gap = !row.mentionedAnywhere && competitorsCited;

  return (
    <TableRow className="cursor-pointer" onClick={onOpen} data-testid={`prompt-row-${row.prompt.id}`}>
      <TableCell className="max-w-xs">
        <p className="truncate font-medium">{row.prompt.text}</p>
        {row.prompt.category && <p className="text-xs text-muted-foreground">{row.prompt.category}</p>}
      </TableCell>
      <TableCell>
        <MentionCell result={row.results.perplexity} />
      </TableCell>
      <TableCell>
        <MentionCell result={row.results.gemini} />
      </TableCell>
      <TableCell className="max-w-[12rem]">
        {topDomains.length ? (
          <span className="truncate text-xs text-muted-foreground">
            {topDomains.map(([d]) => d).join(' · ')}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell>
        {/* Sentiment is judged only where the brand is actually mentioned. */}
        <SentimentDot sentiment={results.find((r) => r.brandMentioned && r.sentiment)?.sentiment} />
      </TableCell>
      <TableCell className="text-right">
        {gap && (
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onBrief();
            }}
          >
            <Lightbulb /> Close the gap
          </Button>
        )}
      </TableCell>
    </TableRow>
  );
}

function ResultDrawer({ row, onClose }: { row: RunSummaryPrompt; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Answer details">
      <button
        type="button"
        aria-label="Close details"
        onClick={onClose}
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
      />
      <div className="liquid-shell absolute inset-y-0 right-0 w-full max-w-lg overflow-y-auto border-l p-6 animate-fade-up">
        <div className="mb-4 flex items-center justify-between gap-3">
          <span className="font-display text-sm font-semibold">{row.prompt.text}</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="btn-glass flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {(['perplexity', 'gemini'] as const).map((engine) => {
          const result = row.results[engine];
          if (!result) {
            return (
              <div key={engine} className="glass-tile mb-4 p-4">
                <p className="mb-1 text-sm font-medium">{ENGINE_LABELS[engine]}</p>
                <p className="text-sm text-muted-foreground">
                  Not queried in this run — no data to show.
                </p>
              </div>
            );
          }
          return (
            <div key={engine} className="glass-tile mb-4 p-4">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium">{ENGINE_LABELS[engine]}</p>
                {result.brandMentioned ? (
                  <Badge variant="success">mentioned{result.brandRank ? ` #${result.brandRank}` : ''}</Badge>
                ) : (
                  <Badge variant="secondary">not mentioned</Badge>
                )}
                {result.parseFailed && <Badge variant="warning">parse failed</Badge>}
              </div>
              {result.answerExcerpt && (
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">{result.answerExcerpt}</p>
              )}
              {result.citations.length > 0 && (
                <div className="mt-3">
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Citations
                  </p>
                  <ul className="space-y-1">
                    {result.citations.slice(0, 8).map((c, i) => (
                      <li key={i} className="flex items-center gap-1.5 text-xs">
                        <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
                        <a
                          href={c.url}
                          target="_blank"
                          rel="noreferrer"
                          className="truncate text-primary underline-offset-2 hover:underline"
                        >
                          {c.title ?? hostnameOf(c.url)}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {result.competitorMentions.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {result.competitorMentions.map((m) => (
                    <Badge key={m.name} variant="outline">
                      {m.name} ×{m.count}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PromptManager({
  prompts,
  newPrompt,
  setNewPrompt,
  onAdd,
  onDelete,
  busy,
  autoFocus,
}: {
  prompts: GeoPrompt[];
  newPrompt: string;
  setNewPrompt: (value: string) => void;
  onAdd: () => void;
  onDelete: (id: string) => void;
  busy: boolean;
  autoFocus?: boolean;
}) {
  const MAX = 60;
  return (
    <Card data-testid="prompt-manager">
      <CardHeader>
        <CardTitle className="text-base">
          Tracked prompts <span className="text-sm font-normal text-muted-foreground">({prompts.length}/{MAX})</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {prompts.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Add the questions your customers ask AI engines. GrowthCrew scans them weekly on
            Perplexity and Gemini — ChatGPT support is coming soon.
          </p>
        )}
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            onAdd();
          }}
        >
          <Input
            value={newPrompt}
            onChange={(e) => setNewPrompt(e.target.value)}
            placeholder={SUGGESTED_PROMPTS[prompts.length % SUGGESTED_PROMPTS.length]}
            maxLength={500}
            autoFocus={autoFocus}
            aria-label="New prompt"
            data-testid="new-prompt-input"
          />
          <Button type="submit" disabled={busy || newPrompt.trim().length === 0 || prompts.length >= MAX}>
            {busy ? <Loader2 className="animate-spin" /> : <Plus />} Add
          </Button>
        </form>
        {prompts.length === 0 && (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Suggestions (click to use)
            </p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTED_PROMPTS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setNewPrompt(s)}
                  className="glass-tile rounded-xl px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {prompts.length > 0 && (
          <ul className="space-y-1.5">
            {prompts.map((p) => (
              <li key={p.id} className="glass-tile flex items-center justify-between gap-2 p-2.5">
                <span className="truncate text-sm">{p.text}</span>
                <button
                  type="button"
                  aria-label={`Remove prompt: ${p.text}`}
                  onClick={() => onDelete(p.id)}
                  className="shrink-0 text-muted-foreground transition-colors hover:text-red-500"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
