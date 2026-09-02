'use client';

// Perfexa Video Studio: generate demo/live short-form videos and record edit
// jobs honestly until a verified live editing provider is configured server-side.

import { useState } from 'react';
import { AlertTriangle, Clapperboard, Film, Link2, Scissors, ShieldCheck, Wand2 } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { PageShell, PageHeader } from '@/components/page-shell';

const STYLES = [
  { key: 'ugc', label: 'UGC style' },
  { key: 'product_demo', label: 'Product demo' },
  { key: 'cinematic', label: 'Cinematic' },
  { key: 'slideshow', label: 'Slideshow' },
] as const;

const RATIOS = [
  { key: '9:16', label: '9:16 vertical' },
  { key: '1:1', label: '1:1 square' },
  { key: '16:9', label: '16:9 landscape' },
] as const;

const PRESETS = [
  {
    label: 'Hook test',
    prompt: 'A founder opens with a 3-second problem hook, shows the product in use, and ends on a clear trial CTA.',
    cta: 'Book a demo this week.',
  },
  {
    label: 'Social proof',
    prompt: 'A customer-style testimonial clip with fast captions, before-and-after framing, and a credible outcome.',
    cta: 'See the results.',
  },
  {
    label: 'Offer launch',
    prompt: 'A vertical performance ad announcing a limited offer, quick product cuts, captions, and urgency.',
    cta: 'Claim the offer today.',
  },
] as const;

const STATUS_LABEL: Record<string, string> = {
  queued: 'Queued',
  processing: 'Processing',
  completed: 'Completed',
  failed: 'Failed',
  needs_approval: 'Awaiting approval',
  provider_not_configured: 'Provider not configured',
};

function statusTone(status: string): 'default' | 'secondary' | 'destructive' | 'outline' | 'warning' {
  if (status === 'completed') return 'default';
  if (status === 'failed' || status === 'provider_not_configured') return 'destructive';
  if (status === 'needs_approval') return 'warning';
  return 'secondary';
}

function providerTone(state?: string): 'default' | 'secondary' | 'destructive' | 'outline' | 'warning' {
  if (state === 'live') return 'warning';
  if (state === 'provider_not_configured') return 'destructive';
  if (state === 'demo') return 'secondary';
  return 'outline';
}

function formatCreatedAt(value: Date | string): string {
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function hostOf(value?: string | null): string | null {
  if (!value) return null;
  try {
    return new URL(value).host;
  } catch {
    return null;
  }
}

export default function VideoPage() {
  const utils = trpc.useUtils();
  const jobs = trpc.video.list.useQuery();
  const studioStatus = trpc.video.status.useQuery();
  const create = trpc.video.create.useMutation({ onSuccess: () => utils.video.invalidate() });

  const [mode, setMode] = useState<'generate' | 'edit'>('generate');
  const [prompt, setPrompt] = useState('');
  const [ctaBrief, setCtaBrief] = useState('');
  const [style, setStyle] = useState<(typeof STYLES)[number]['key']>('ugc');
  const [aspectRatio, setAspectRatio] = useState<(typeof RATIOS)[number]['key']>('9:16');
  const [durationSec, setDurationSec] = useState(15);
  const [approvalConfirmed, setApprovalConfirmed] = useState(false);

  const [sourceUrl, setSourceUrl] = useState('');
  const [editInstructions, setEditInstructions] = useState('');
  const [editAspectRatio, setEditAspectRatio] = useState<(typeof RATIOS)[number]['key']>('9:16');
  const [trimStartSec, setTrimStartSec] = useState('');
  const [trimEndSec, setTrimEndSec] = useState('');
  const [overlayText, setOverlayText] = useState('');

  const providerState = studioStatus.data?.state;
  const paidGenerationNeedsApproval =
    studioStatus.data?.generation.approvalRequired === true && providerState === 'live';
  const parsedTrimStart = trimStartSec === '' ? undefined : Number(trimStartSec);
  const parsedTrimEnd = trimEndSec === '' ? undefined : Number(trimEndSec);
  const trimIsValid =
    (parsedTrimStart === undefined || Number.isInteger(parsedTrimStart)) &&
    (parsedTrimEnd === undefined || Number.isInteger(parsedTrimEnd)) &&
    (parsedTrimStart === undefined || parsedTrimStart >= 0) &&
    (parsedTrimEnd === undefined || parsedTrimEnd >= 0) &&
    (parsedTrimStart === undefined || parsedTrimEnd === undefined || parsedTrimEnd > parsedTrimStart);

  const canGenerate =
    prompt.trim().length >= 4 &&
    durationSec >= 3 &&
    durationSec <= 120 &&
    (!paidGenerationNeedsApproval || approvalConfirmed) &&
    !create.isPending;
  const canEdit =
    isHttpsUrl(sourceUrl.trim()) &&
    editInstructions.trim().length >= 4 &&
    trimIsValid &&
    !create.isPending;

  function onGenerate() {
    if (!canGenerate) return;
    create.mutate(
      {
        mode: 'generate',
        prompt: prompt.trim(),
        ctaBrief: ctaBrief.trim() || undefined,
        style,
        aspectRatio,
        durationSec,
        idempotencyKey: `video-generate-${crypto.randomUUID()}`,
      },
      {
        onSuccess: () => {
          setPrompt('');
          setCtaBrief('');
          setApprovalConfirmed(false);
        },
      },
    );
  }

  function onEdit() {
    if (!canEdit) return;
    create.mutate(
      {
        mode: 'edit',
        sourceUrl: sourceUrl.trim(),
        editInstructions: editInstructions.trim(),
        aspectRatio: editAspectRatio,
        trimStartSec: parsedTrimStart,
        trimEndSec: parsedTrimEnd,
        overlayText: overlayText.trim() || undefined,
        idempotencyKey: `video-edit-${crypto.randomUUID()}`,
      },
      {
        onSuccess: () => {
          setSourceUrl('');
          setEditInstructions('');
          setTrimStartSec('');
          setTrimEndSec('');
          setOverlayText('');
        },
      },
    );
  }

  return (
    <PageShell className="space-y-6" data-testid="video-page">
      <PageHeader
        eyebrow="Creative"
        title="Perfexa Video Studio"
        description="Create short-form creative and record edit requests in one approval-aware workspace. Provider state and asset source are shown on every job."
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(280px,0.8fr)]">
        <Card className="glass rounded-2xl">
          <CardHeader className="gap-4 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <Clapperboard className="h-4 w-4 text-primary" /> New video
            </CardTitle>
            <div className="inline-flex rounded-lg border border-[color:var(--glass-border)] bg-[color:var(--glass-bg-subtle)] p-1">
              <Button
                type="button"
                size="sm"
                variant={mode === 'generate' ? 'default' : 'ghost'}
                onClick={() => setMode('generate')}
              >
                <Wand2 className="h-4 w-4" /> Generate
              </Button>
              <Button
                type="button"
                size="sm"
                variant={mode === 'edit' ? 'default' : 'ghost'}
                onClick={() => setMode('edit')}
              >
                <Scissors className="h-4 w-4" /> Edit
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {mode === 'generate' ? (
              <>
                <div className="flex flex-wrap gap-2">
                  {PRESETS.map((preset) => (
                    <Button
                      key={preset.label}
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setPrompt(preset.prompt);
                        setCtaBrief(preset.cta);
                      }}
                    >
                      {preset.label}
                    </Button>
                  ))}
                </div>
                <div className="space-y-1.5">
                  <Label>Prompt</Label>
                  <Textarea
                    placeholder="A 25-year-old unboxes a skincare set, surprised by the glow, vertical UGC, sound-on"
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    rows={4}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Campaign or CTA brief</Label>
                  <Input
                    placeholder="Launch offer, booking CTA, trial sign-up, retargeting angle"
                    value={ctaBrief}
                    onChange={(e) => setCtaBrief(e.target.value)}
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label>Style</Label>
                    <Select value={style} onChange={(e) => setStyle(e.target.value as typeof style)}>
                      {STYLES.map((s) => (
                        <option key={s.key} value={s.key}>
                          {s.label}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Aspect ratio</Label>
                    <Select value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value as typeof aspectRatio)}>
                      {RATIOS.map((r) => (
                        <option key={r.key} value={r.key}>
                          {r.label}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Duration (sec)</Label>
                    <Input
                      type="number"
                      min={3}
                      max={120}
                      value={durationSec}
                      onChange={(e) => setDurationSec(Number(e.target.value))}
                    />
                  </div>
                </div>
                {paidGenerationNeedsApproval && (
                  <label className="flex items-start gap-2 rounded-lg border border-amber-500/25 bg-amber-500/10 p-3 text-sm">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={approvalConfirmed}
                      onChange={(e) => setApprovalConfirmed(e.target.checked)}
                    />
                    <span>
                      Live generation is configured. Submitting creates an approval request first; no paid provider
                      render starts until you approve it.
                    </span>
                  </label>
                )}
                <Button onClick={onGenerate} disabled={!canGenerate}>
                  <Wand2 className="h-4 w-4" />
                  {create.isPending && mode === 'generate' ? 'Submitting...' : 'Generate'}
                </Button>
              </>
            ) : (
              <>
                <div className="rounded-lg border border-[color:var(--glass-border)] bg-[color:var(--glass-bg-subtle)] p-3 text-sm text-muted-foreground">
                  Source video URL upload/storage is not supported yet. Perfexa stores the HTTPS source URL, edit
                  instructions, and requested output settings, but it will not present an edited provider result until a
                  verified editing API is configured.
                </div>
                <div className="space-y-1.5">
                  <Label>Source video URL</Label>
                  <Input
                    placeholder="https://example.com/source-video.mp4"
                    value={sourceUrl}
                    onChange={(e) => setSourceUrl(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Edit brief</Label>
                  <Textarea
                    placeholder="Trim to the strongest hook, add captions, and reframe for paid social."
                    value={editInstructions}
                    onChange={(e) => setEditInstructions(e.target.value)}
                    rows={4}
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label>Output ratio</Label>
                    <Select value={editAspectRatio} onChange={(e) => setEditAspectRatio(e.target.value as typeof editAspectRatio)}>
                      {RATIOS.map((r) => (
                        <option key={r.key} value={r.key}>
                          {r.label}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Trim start</Label>
                    <Input
                      type="number"
                      min={0}
                      placeholder="0"
                      value={trimStartSec}
                      onChange={(e) => setTrimStartSec(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Trim end</Label>
                    <Input
                      type="number"
                      min={0}
                      placeholder="15"
                      value={trimEndSec}
                      onChange={(e) => setTrimEndSec(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Caption or overlay text</Label>
                  <Input
                    placeholder="Your next customer is already searching."
                    value={overlayText}
                    onChange={(e) => setOverlayText(e.target.value)}
                  />
                </div>
                {!trimIsValid && (
                  <p className="text-sm text-destructive">Trim end must be after trim start.</p>
                )}
                <Button onClick={onEdit} disabled={!canEdit}>
                  <Scissors className="h-4 w-4" />
                  {create.isPending && mode === 'edit' ? 'Submitting...' : 'Create edit job'}
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="glass rounded-2xl">
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-3 text-base">
              Provider state
              <Badge variant={providerTone(providerState)}>
                {providerState === 'live'
                  ? 'Live'
                  : providerState === 'provider_not_configured'
                    ? 'Provider not configured'
                    : providerState === 'demo'
                      ? 'Demo/offline'
                      : 'Checking'}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              Provider: <span className="font-medium text-foreground">{studioStatus.data?.label ?? 'Checking'}</span>
            </p>
            {providerState === 'demo' && (
              <p>Demo/offline previews use deterministic mock assets and are not real customer-ready provider output.</p>
            )}
            {providerState === 'provider_not_configured' && (
              <p>
                Provider not configured. Add a server-side FAL_KEY or FAL_API_KEY before live generation. No client-side
                provider keys are used.
              </p>
            )}
            {providerState === 'live' && (
              <p>Live generation is available after approval. Editing remains unavailable until a verified edit API is configured.</p>
            )}
            <p>{studioStatus.data?.editing.reason ?? 'Checking editing capability...'}</p>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">Jobs and library</h2>
        {jobs.data && jobs.data.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {jobs.data.map((job) => {
              const status = job.status ?? 'queued';
              const ratio = job.aspectRatio ?? '9:16';
              const jobStyle = job.style ?? 'ugc';
              const duration = job.durationSec ?? 15;
              const jobMode = (job.mode ?? 'generate') as 'generate' | 'edit';
              const isDemo = job.provider === 'mock';
              const sourceHost = hostOf(job.sourceUrl);
              const resultHost = hostOf(job.resultUrl);

              return (
                <Card key={job.id} className="glass overflow-hidden rounded-2xl">
                  <div className="relative flex aspect-video items-center justify-center bg-muted">
                    {status === 'completed' && job.resultUrl && !isDemo ? (
                      <video controls className="h-full w-full object-cover" src={job.resultUrl} />
                    ) : status === 'completed' && isDemo ? (
                      <div className="flex flex-col items-center gap-2 p-4 text-center">
                        <Film className="h-8 w-8 text-primary" />
                        <span className="text-xs font-medium">Demo/offline preview</span>
                        <span className="line-clamp-2 text-xs text-muted-foreground">{job.prompt}</span>
                      </div>
                    ) : status === 'needs_approval' ? (
                      <div className="flex flex-col items-center gap-2 p-4 text-center">
                        <ShieldCheck className="h-8 w-8 text-amber-500" />
                        <span className="text-xs text-muted-foreground">Awaiting approval before paid render</span>
                      </div>
                    ) : status === 'provider_not_configured' || status === 'failed' ? (
                      <div className="flex flex-col items-center gap-2 p-4 text-center">
                        <AlertTriangle className="h-8 w-8 text-destructive" />
                        <span className="line-clamp-3 text-xs text-muted-foreground">
                          {job.error ?? STATUS_LABEL[status] ?? status}
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">{STATUS_LABEL[status] ?? status}</span>
                    )}
                    <Badge variant={statusTone(status)} className="absolute right-2 top-2">
                      {STATUS_LABEL[status] ?? status}
                    </Badge>
                    <Badge variant="outline" className="absolute left-2 top-2">
                      {jobMode === 'edit' ? 'Edit' : 'Generate'}
                    </Badge>
                  </div>
                  <CardContent className="space-y-2 pt-3">
                    <p className="line-clamp-2 text-sm">
                      {jobMode === 'edit' ? job.editInstructions ?? job.prompt : job.prompt}
                    </p>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span>{job.provider ?? 'mock'}</span>
                      <span>/</span>
                      <span>{ratio}</span>
                      <span>/</span>
                      <span>{duration}s</span>
                      {jobMode === 'generate' && (
                        <>
                          <span>/</span>
                          <span>{jobStyle}</span>
                        </>
                      )}
                      {typeof job.costCents === 'number' && job.costCents > 0 && (
                        <>
                          <span>/</span>
                          <span>${(job.costCents / 100).toFixed(2)}</span>
                        </>
                      )}
                    </div>
                    <div className="space-y-1 text-xs text-muted-foreground">
                      <p className="flex items-center gap-1">
                        <Link2 className="h-3 w-3" />
                        {jobMode === 'edit'
                          ? `Source URL${sourceHost ? `: ${sourceHost}` : ''}`
                          : isDemo
                            ? 'Source: demo/offline mock adapter'
                            : `Source: provider result${resultHost ? ` from ${resultHost}` : ''}`}
                      </p>
                      {job.overlayText && <p>Overlay: {job.overlayText}</p>}
                      {(job.trimStartSec !== null || job.trimEndSec !== null) && (
                        <p>
                          Trim: {job.trimStartSec ?? 0}s to {job.trimEndSec ?? 'end'}
                        </p>
                      )}
                      <p>Created {formatCreatedAt(job.createdAt)}</p>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <Card className="glass rounded-2xl">
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              No video jobs yet. Create a generated concept or record an edit request above.
            </CardContent>
          </Card>
        )}
      </div>
    </PageShell>
  );
}
