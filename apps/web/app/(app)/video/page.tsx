'use client';

// Video studio: generate short marketing videos from a prompt. Mock mode
// completes instantly offline; live renders are gated behind an approval.

import { useState } from 'react';
import { Clapperboard, Play, ShieldCheck } from 'lucide-react';
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

const STATUS_LABEL: Record<string, string> = {
  queued: 'Queued',
  processing: 'Processing',
  completed: 'Completed',
  failed: 'Failed',
  needs_approval: 'Needs approval',
};

function statusTone(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (status === 'completed') return 'default';
  if (status === 'failed') return 'destructive';
  if (status === 'needs_approval') return 'outline';
  return 'secondary';
}

export default function VideoPage() {
  const utils = trpc.useUtils();
  const jobs = trpc.video.list.useQuery();
  const create = trpc.video.create.useMutation({ onSuccess: () => utils.video.invalidate() });

  const [prompt, setPrompt] = useState('');
  const [style, setStyle] = useState<(typeof STYLES)[number]['key']>('ugc');
  const [aspectRatio, setAspectRatio] = useState<(typeof RATIOS)[number]['key']>('9:16');
  const [durationSec, setDurationSec] = useState(15);

  const canGenerate = prompt.trim().length >= 4 && !create.isPending;

  function onGenerate() {
    if (!canGenerate) return;
    create.mutate(
      { prompt: prompt.trim(), style, aspectRatio, durationSec },
      {
        onSuccess: () => {
          setPrompt('');
        },
      },
    );
  }

  return (
    <PageShell className="space-y-6" data-testid="video-page">
      <PageHeader
        eyebrow="Creative"
        title="Video studio"
        description="Generate short marketing videos from a prompt. Mock mode renders instantly; live renders wait for your approval before any spend."
      />

      <Card className="glass rounded-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Clapperboard className="h-4 w-4 text-primary" /> New video
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Prompt</Label>
            <Textarea
              placeholder="e.g. “A 25-year-old unboxes a skincare set, surprised by the glow, vertical UGC, sound-on”"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={3}
            />
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label>Style</Label>
              <Select value={style} onChange={(e) => setStyle(e.target.value as typeof style)} className="w-40">
                {STYLES.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Aspect ratio</Label>
              <Select
                value={aspectRatio}
                onChange={(e) => setAspectRatio(e.target.value as typeof aspectRatio)}
                className="w-40"
              >
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
                className="w-28"
              />
            </div>
            <Button onClick={onGenerate} disabled={!canGenerate}>
              {create.isPending ? 'Generating…' : 'Generate'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">Jobs</h2>
        {jobs.data && jobs.data.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {jobs.data.map((job) => {
              const status = job.status ?? 'queued';
              const ratio = job.aspectRatio ?? '9:16';
              const jobStyle = job.style ?? 'ugc';
              const duration = job.durationSec ?? 15;
              return (
              <Card key={job.id} className="glass overflow-hidden rounded-2xl">
                <div className="relative flex aspect-video items-center justify-center bg-muted">
                  {status === 'completed' && job.resultUrl ? (
                    <div className="flex flex-col items-center gap-2 p-4 text-center">
                      <Play className="h-8 w-8 text-primary" />
                      <span className="line-clamp-2 text-xs text-muted-foreground">{job.prompt}</span>
                    </div>
                  ) : status === 'needs_approval' ? (
                    <div className="flex flex-col items-center gap-2 p-4 text-center">
                      <ShieldCheck className="h-8 w-8 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">Approve to render</span>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">{STATUS_LABEL[status] ?? status}</span>
                  )}
                  <Badge variant={statusTone(status)} className="absolute right-2 top-2">
                    {STATUS_LABEL[status] ?? status}
                  </Badge>
                </div>
                <CardContent className="space-y-1.5 pt-3">
                  <p className="line-clamp-2 text-sm">{job.prompt}</p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{ratio}</span>
                    <span>·</span>
                    <span>{duration}s</span>
                    <span>·</span>
                    <span>{jobStyle}</span>
                    {typeof job.costCents === 'number' && job.costCents > 0 && (
                      <>
                        <span>·</span>
                        <span>${(job.costCents / 100).toFixed(2)}</span>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
              );
            })}
          </div>
        ) : (
          <Card className="glass rounded-2xl">
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              No videos yet. Write a prompt above to generate your first one.
            </CardContent>
          </Card>
        )}
      </div>
    </PageShell>
  );
}
