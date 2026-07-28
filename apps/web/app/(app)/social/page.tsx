'use client';

// Social media suite: AI composer, content calendar/queue, engagement
// metrics. Publishing is always behind an explicit approval click.

import { useMemo, useState } from 'react';
import { CalendarDays, Heart, MessageCircle, RefreshCw, Send, Share2, Sparkles, Trash2 } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { PageShell, PageHeader } from '@/components/page-shell';

const PLATFORMS = [
  { key: 'instagram', label: 'Instagram' },
  { key: 'facebook', label: 'Facebook' },
  { key: 'x', label: 'X (Twitter)' },
  { key: 'linkedin', label: 'LinkedIn' },
  { key: 'tiktok', label: 'TikTok' },
] as const;

const PLATFORM_LABEL = Object.fromEntries(PLATFORMS.map((p) => [p.key, p.label]));

function StatusBadge({ status }: { status: string | null }) {
  return (
    <Badge
      variant={
        status === 'published' ? 'success' : status === 'scheduled' ? 'warning' : status === 'failed' ? 'destructive' : 'secondary'
      }
    >
      {status}
    </Badge>
  );
}

export default function SocialPage() {
  const utils = trpc.useUtils();
  const posts = trpc.social.list.useQuery();
  const summary = trpc.social.summary.useQuery();

  const invalidate = () => {
    void utils.social.invalidate();
    void utils.dashboard.invalidate();
  };

  const create = trpc.social.create.useMutation({ onSuccess: invalidate });
  const publish = trpc.social.publish.useMutation({ onSuccess: invalidate });
  const remove = trpc.social.delete.useMutation({ onSuccess: invalidate });
  const refresh = trpc.social.refreshEngagement.useMutation({ onSuccess: invalidate });

  const [platform, setPlatform] = useState<(typeof PLATFORMS)[number]['key']>('instagram');
  const [mode, setMode] = useState<'topic' | 'write'>('topic');
  const [topic, setTopic] = useState('');
  const [content, setContent] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');

  const grouped = useMemo(() => {
    const byDay = new Map<string, NonNullable<typeof posts.data>>();
    for (const post of posts.data ?? []) {
      const when = post.scheduledAt ?? post.publishedAt ?? post.createdAt;
      const day = new Date(when).toISOString().slice(0, 10);
      if (!byDay.has(day)) byDay.set(day, []);
      byDay.get(day)!.push(post);
    }
    return [...byDay.entries()].sort(([a], [b]) => b.localeCompare(a));
  }, [posts.data]);

  function submit() {
    create.mutate(
      {
        platform,
        ...(mode === 'topic' ? { topic: topic.trim() } : { content: content.trim() }),
        ...(scheduledAt ? { scheduledAt: new Date(scheduledAt).toISOString() } : {}),
      },
      {
        onSuccess: () => {
          setTopic('');
          setContent('');
          setScheduledAt('');
        },
      },
    );
  }

  const s = summary.data;
  return (
    <PageShell className="space-y-6" data-testid="social-page">
      <PageHeader
        eyebrow="Channel"
        title="Social media"
        description="Draft, schedule, and track engagement. Publishing is always gated behind your explicit approval."
        actions={
          <Button variant="outline" size="sm" disabled={refresh.isPending} onClick={() => refresh.mutate()}>
            <RefreshCw className={refresh.isPending ? 'animate-spin' : ''} /> Refresh engagement
          </Button>
        }
      />

      {s && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {[
            { label: 'Published', value: s.published },
            { label: 'Scheduled', value: s.scheduled },
            { label: 'Drafts', value: s.drafts },
            { label: 'Impressions', value: s.totals.impressions.toLocaleString() },
            { label: 'Likes', value: s.totals.likes.toLocaleString() },
            { label: 'Comments', value: s.totals.comments.toLocaleString() },
            { label: 'Shares', value: s.totals.shares.toLocaleString() },
          ].map((kpi) => (
            <Card key={kpi.label} className="lift">
              <CardContent className="p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">{kpi.label}</p>
                <p className="font-display mt-1 text-xl font-semibold">{kpi.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Composer */}
      <Card className="glass rounded-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-primary" /> New post
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-3">
            <div className="space-y-1.5">
              <Label>Platform</Label>
              <Select value={platform} onChange={(e) => setPlatform(e.target.value as typeof platform)} className="w-40">
                {PLATFORMS.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Schedule (optional)</Label>
              <Input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                className="w-56"
              />
            </div>
            <div className="space-y-1.5">
              <Label>How?</Label>
              <div className="glass-subtle flex rounded-full p-1">
                <button
                  type="button"
                  onClick={() => setMode('topic')}
                  className={cn('rounded-full px-3 py-1 text-sm transition-all duration-300', mode === 'topic' && 'tab-active')}
                >
                  AI draft
                </button>
                <button
                  type="button"
                  onClick={() => setMode('write')}
                  className={cn('rounded-full px-3 py-1 text-sm transition-all duration-300', mode === 'write' && 'tab-active')}
                >
                  Write myself
                </button>
              </div>
            </div>
          </div>
          {mode === 'topic' ? (
            <Input
              placeholder="What should the post be about? e.g. “our summer discount — 20% off all repairs”"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              data-testid="social-topic"
            />
          ) : (
            <Textarea
              placeholder="Write your post…"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={3}
            />
          )}
          <div className="flex items-center gap-3">
            <Button
              disabled={create.isPending || (mode === 'topic' ? !topic.trim() : !content.trim())}
              onClick={submit}
              data-testid="social-create"
            >
              <Sparkles /> {mode === 'topic' ? 'Draft with AI' : 'Save draft'}
            </Button>
            {create.error && <p className="text-sm text-destructive">{create.error.message}</p>}
          </div>
        </CardContent>
      </Card>

      {/* Queue / calendar */}
      <Tabs defaultValue="queue">
        <TabsList>
          <TabsTrigger value="queue">Queue</TabsTrigger>
          <TabsTrigger value="calendar">Calendar</TabsTrigger>
        </TabsList>

        <TabsContent value="queue" className="space-y-3">
          {(posts.data ?? []).map((post) => (
            <Card key={post.id} className="lift" data-testid="social-post">
              <CardContent className="flex flex-wrap items-start justify-between gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{PLATFORM_LABEL[post.platform ?? ''] ?? post.platform}</Badge>
                    <StatusBadge status={post.status} />
                    {post.scheduledAt && post.status === 'scheduled' && (
                      <span className="text-xs text-muted-foreground">
                        <CalendarDays className="mr-1 inline h-3 w-3" />
                        {new Date(post.scheduledAt).toLocaleString()}
                      </span>
                    )}
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm">{post.content}</p>
                  {post.status === 'published' && post.metrics && (
                    <p className="mt-2 flex flex-wrap gap-4 text-xs text-muted-foreground">
                      <span>{(post.metrics.impressions ?? 0).toLocaleString()} impressions</span>
                      <span>
                        <Heart className="mr-1 inline h-3 w-3" />
                        {post.metrics.likes ?? 0}
                      </span>
                      <span>
                        <MessageCircle className="mr-1 inline h-3 w-3" />
                        {post.metrics.comments ?? 0}
                      </span>
                      <span>
                        <Share2 className="mr-1 inline h-3 w-3" />
                        {post.metrics.shares ?? 0}
                      </span>
                    </p>
                  )}
                </div>
                {post.status !== 'published' && (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      disabled={publish.isPending}
                      onClick={() => publish.mutate({ id: post.id, via: 'click' })}
                      data-testid="social-publish"
                    >
                      <Send /> Approve & publish
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label="Delete draft"
                      disabled={remove.isPending}
                      onClick={() => remove.mutate({ id: post.id })}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
          {posts.data?.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No posts yet — draft one above, or just tell the Voice Console: “post about our summer
              offer on Instagram”.
            </p>
          )}
        </TabsContent>

        <TabsContent value="calendar" className="space-y-4">
          {grouped.map(([day, dayPosts]) => (
            <div key={day}>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {new Date(`${day}T00:00:00`).toLocaleDateString(undefined, {
                  weekday: 'long',
                  month: 'short',
                  day: 'numeric',
                })}
              </p>
              <div className="space-y-2">
                {dayPosts.map((post) => (
                  <div key={post.id} className="glass flex items-center gap-3 rounded-xl p-3">
                    <Badge variant="outline">{PLATFORM_LABEL[post.platform ?? ''] ?? post.platform}</Badge>
                    <p className="min-w-0 flex-1 truncate text-sm">{post.content}</p>
                    <StatusBadge status={post.status} />
                  </div>
                ))}
              </div>
            </div>
          ))}
          {grouped.length === 0 && <p className="text-sm text-muted-foreground">Nothing planned yet.</p>}
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
