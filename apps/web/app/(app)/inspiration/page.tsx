'use client';

import Link from 'next/link';
import {
  ArrowRight,
  BadgeCheck,
  Bot,
  BrainCircuit,
  CheckCircle2,
  ClipboardCheck,
  Eye,
  FileText,
  Megaphone,
  MousePointerClick,
  Search,
  ShieldCheck,
  Sparkles,
  WandSparkles,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { PageHeader, PageShell } from '@/components/page-shell';

const WORKFLOW = [
  {
    title: 'Research the market',
    detail: 'Collect competitor names, landing pages, public ad libraries, and visible hooks without requiring ad-account access.',
    icon: Search,
    state: 'Public evidence only',
  },
  {
    title: 'Extract useful patterns',
    detail: 'Summarize angles, offers, formats, proof points, objections, and CTA structures that appear worth testing.',
    icon: Eye,
    state: 'No private metrics claimed',
  },
  {
    title: 'Adapt for your Business Brain',
    detail: 'Turn the observed pattern into your offer, audience, tone, constraints, and local proof. Similar intent, original execution.',
    icon: BrainCircuit,
    state: 'Brand-safe adaptation',
  },
  {
    title: 'Draft a paused campaign',
    detail: 'Produce copy, creative brief, budget, audience, success criteria, and a launch checklist. Nothing spends until approval.',
    icon: Megaphone,
    state: 'Approval required',
  },
] as const;

const SAMPLE_INPUTS = [
  'Find three local competitors and turn their strongest visible angles into my next campaign draft.',
  'Research brands selling to homeowners and adapt the best lead-gen hook for my plumbing business.',
  'Use my Business Brain, compare competitors, and create a paused Google Ads draft with review steps.',
] as const;

const PATTERNS = [
  {
    label: 'Observed competitor angle',
    value: 'Same-day emergency service framed around speed and trust.',
  },
  {
    label: 'Why it may work',
    value: 'The message meets urgent intent and lowers risk before the visitor calls.',
  },
  {
    label: 'Sayso adaptation',
    value: 'Original ad concept: “A trusted local expert at your door today” with proof, service area, and call CTA.',
  },
  {
    label: 'Review gate',
    value: 'Confirm service availability, budget ceiling, tracking, and landing-page fit before launch.',
  },
] as const;

const DELIVERABLES = [
  'Competitor evidence brief',
  'Reusable hooks and objections map',
  'Original ad copy variants',
  'Creative direction for image/video production',
  'Paused campaign plan with budget and audience',
  'Approval checklist before spend',
] as const;

export default function InspirationPage() {
  return (
    <PageShell className="space-y-6" data-testid="inspiration-page">
      <PageHeader
        eyebrow="Market inspiration"
        title="Competitor Inspiration Studio"
        description="Research what competitors are visibly doing, extract the useful pattern, then turn it into original campaign drafts for your business."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href="/competitors">
                Track competitors <Search />
              </Link>
            </Button>
            <Button asChild>
              <Link href="/console">
                Start in Voice Console <Bot />
              </Link>
            </Button>
          </div>
        }
      />

      <Card className="overflow-hidden border-primary/20 bg-primary/[0.04]">
        <CardContent className="grid gap-6 p-5 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="success"><CheckCircle2 className="mr-1 h-3 w-3" /> Draft-first</Badge>
              <Badge variant="outline"><ShieldCheck className="mr-1 h-3 w-3" /> No copy/paste cloning</Badge>
              <Badge variant="outline"><MousePointerClick className="mr-1 h-3 w-3" /> No live spend</Badge>
            </div>
            <div>
              <h2 className="font-display text-2xl font-semibold tracking-tight">Sayso’s version: research → adapt → approve.</h2>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                The goal is not to steal a competitor’s ad. The goal is to understand public market signals, translate the working pattern into your Business Brain, and create a campaign draft you can review before anything goes public.
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <div className="glass-tile p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Input</p>
                <p className="mt-1 font-medium">Brand, URL, or niche</p>
              </div>
              <div className="glass-tile p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Context</p>
                <p className="mt-1 font-medium">Business Brain</p>
              </div>
              <div className="glass-tile p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Output</p>
                <p className="mt-1 font-medium">Paused campaign draft</p>
              </div>
            </div>
          </div>

          <Card className="glass-strong">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base"><WandSparkles className="h-4 w-4 text-primary" /> Prompt launcher</CardTitle>
              <CardDescription>Use this pattern in the Voice Console today.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input readOnly value="Research competitors and draft my next campaign" aria-label="Sample inspiration prompt" />
              <div className="space-y-2">
                {SAMPLE_INPUTS.map((prompt) => (
                  <div key={prompt} className="glass-tile p-3 text-sm text-muted-foreground">
                    “{prompt}”
                  </div>
                ))}
              </div>
              <Button asChild className="w-full">
                <Link href="/console">
                  Open Console <ArrowRight />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-4">
        {WORKFLOW.map(({ title, detail, icon: Icon, state }, index) => (
          <Card key={title} className="lift animate-fade-up" style={{ animationDelay: `${index * 55}ms` }}>
            <CardHeader className="pb-3">
              <div className="glass-chip mb-3 flex h-10 w-10 items-center justify-center rounded-xl text-primary">
                <Icon className="h-5 w-5" />
              </div>
              <CardTitle className="text-base">{title}</CardTitle>
              <CardDescription>{state}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-relaxed text-muted-foreground">{detail}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Example pattern card</CardTitle>
            <CardDescription>How Sayso turns competitor research into an original campaign direction.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {PATTERNS.map((item) => (
              <div key={item.label} className="glass-tile p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">{item.label}</p>
                <p className="mt-1 text-sm font-medium leading-relaxed">{item.value}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">What the draft should include</CardTitle>
            <CardDescription>Enough to review and improve, never enough to spend without approval.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {DELIVERABLES.map((deliverable) => (
              <div key={deliverable} className="glass-tile flex items-start gap-2 p-3 text-sm">
                <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>{deliverable}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card className="border-amber-500/25 bg-amber-500/[0.04]">
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="glass-chip flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-amber-500">
              <ClipboardCheck className="h-4 w-4" />
            </div>
            <div>
              <p className="font-medium">Safety boundary</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Sayso may draft, compare, and recommend. It must not publish ads, use competitor assets, or activate budget without explicit approval.
              </p>
            </div>
          </div>
          <Button asChild variant="outline" className="shrink-0">
            <Link href="/proposals">
              Review proposals <FileText />
            </Link>
          </Button>
        </CardContent>
      </Card>
    </PageShell>
  );
}
