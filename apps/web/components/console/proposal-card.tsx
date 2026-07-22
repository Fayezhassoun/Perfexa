'use client';

// Proposal review card (CONTRACTS §10): structured plan with Approve / Edit /
// Reject, usable by click here or by saying "approve" in the console.

import { useState } from 'react';
import { Bot, Check, Pencil, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';

export interface PlanShape {
  title: string;
  summary: string;
  businessGoal: string;
  geography?: string;
  monthlyBudgetCents: number;
  budgetSplit: { platform: string; cents: number }[];
  agents: { type: string; name: string; rationale: string; tasks: string[] }[];
  actions: { toolName: string; args: unknown; summary: string; gated: true }[];
  timeline: string;
  expectedOutcomes: string[];
}

const PLATFORM_LABELS: Record<string, string> = {
  google_ads: 'Google Ads',
  meta: 'Meta',
  tiktok: 'TikTok',
  reserve: 'Held in reserve',
};

export function dollars(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

export function ProposalCard({
  plan,
  status,
  busy,
  onApprove,
  onReject,
  onRequestChanges,
}: {
  plan: PlanShape;
  status: string;
  busy?: boolean;
  onApprove?: () => void;
  onReject?: () => void;
  onRequestChanges?: (comment: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [comment, setComment] = useState('');
  const pending = status === 'pending';

  return (
    <Card data-testid="proposal-card" className="border-primary/40">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">{plan.title}</CardTitle>
            <CardDescription className="mt-1">{plan.summary}</CardDescription>
          </div>
          <Badge
            variant={status === 'approved' ? 'success' : status === 'rejected' ? 'destructive' : 'warning'}
          >
            {status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="glass-tile p-3">
            <p className="text-xs uppercase text-muted-foreground">Budget — {dollars(plan.monthlyBudgetCents)}/mo</p>
            <ul className="mt-1 space-y-1 text-sm">
              {plan.budgetSplit.map((s) => (
                <li key={s.platform} className="flex justify-between">
                  <span>{PLATFORM_LABELS[s.platform] ?? s.platform}</span>
                  <span className="font-medium">{dollars(s.cents)}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="glass-tile p-3">
            <p className="text-xs uppercase text-muted-foreground">Timeline</p>
            <p className="mt-1 text-sm">{plan.timeline}</p>
            {plan.geography && (
              <p className="mt-1 text-sm text-muted-foreground">Targeting: {plan.geography}</p>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs uppercase text-muted-foreground">Your new team</p>
          {plan.agents.map((agent) => (
            <div key={agent.type} className="glass-tile flex gap-2 p-3">
              <Bot className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <div className="min-w-0">
                <p className="text-sm font-medium">{agent.name}</p>
                <p className="text-sm text-muted-foreground">{agent.rationale}</p>
                <ul className="mt-1 list-inside list-disc text-xs text-muted-foreground">
                  {agent.tasks.map((task) => (
                    <li key={task}>{task}</li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>

        {plan.actions.length > 0 && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
            <p className="text-xs uppercase text-amber-500">Needs your approval before anything runs</p>
            <ul className="mt-1 space-y-1 text-sm">
              {plan.actions.map((action, i) => (
                <li key={i}>{action.summary}</li>
              ))}
            </ul>
          </div>
        )}

        {pending && onApprove && (
          <>
            {editing ? (
              <div className="space-y-2">
                <Textarea
                  placeholder="Tell us what to change — e.g. “lower the budget to $300” or “focus on Meta instead”"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={busy || !comment.trim()}
                    onClick={() => onRequestChanges?.(comment.trim())}
                  >
                    Send changes
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                    Never mind
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" disabled={busy} onClick={onApprove} data-testid="approve-proposal">
                  <Check /> Approve
                </Button>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => setEditing(true)}>
                  <Pencil /> Edit
                </Button>
                <Button size="sm" variant="destructive" disabled={busy} onClick={onReject}>
                  <X /> Reject
                </Button>
                <span className="text-xs text-muted-foreground">…or just say “approve”</span>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
