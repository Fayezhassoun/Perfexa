'use client';

// Content studio: AI-drafted blogs / ad copy / captions grounded on the site
// audit + knowledge base, with a review → approve/reject workflow.

import { useState } from 'react';
import { Check, PenLine, Sparkles, X } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

const TYPES = [
  { key: 'blog', label: 'Blog post' },
  { key: 'ad_copy', label: 'Ad copy' },
  { key: 'social_caption', label: 'Social caption' },
] as const;

const TYPE_LABEL = Object.fromEntries(TYPES.map((t) => [t.key, t.label]));

export default function ContentPage() {
  const utils = trpc.useUtils();
  const pieces = trpc.content.list.useQuery();
  const draft = trpc.content.draft.useMutation({ onSuccess: () => utils.content.invalidate() });
  const update = trpc.content.update.useMutation({ onSuccess: () => utils.content.invalidate() });

  const [type, setType] = useState<(typeof TYPES)[number]['key']>('blog');
  const [topic, setTopic] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editBody, setEditBody] = useState('');

  return (
    <div className="space-y-6 p-6" data-testid="content-page">
      <h1 className="font-display text-2xl font-semibold tracking-tight">Content studio</h1>
      <p className="text-sm text-muted-foreground">
        Drafts are grounded on your site audit and the best-practice knowledge base. Nothing is used
        anywhere until you approve it.
      </p>

      <Card className="glass rounded-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-primary" /> Draft something new
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select value={type} onChange={(e) => setType(e.target.value as typeof type)} className="w-40">
              {TYPES.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="min-w-64 flex-1 space-y-1.5">
            <Label>Topic</Label>
            <Input
              placeholder="e.g. “emergency plumbing in Chicago — what it costs”"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
            />
          </div>
          <Button
            disabled={draft.isPending || topic.trim().length < 3}
            onClick={() => draft.mutate({ type, topic: topic.trim() }, { onSuccess: () => setTopic('') })}
          >
            <Sparkles /> {draft.isPending ? 'Drafting…' : 'Draft it'}
          </Button>
          {draft.error && <p className="w-full text-sm text-destructive">{draft.error.message}</p>}
        </CardContent>
      </Card>

      <div className="space-y-3">
        {(pieces.data ?? []).map((piece) => (
          <Card key={piece.id} className="lift" data-testid="content-piece">
            <CardContent className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{TYPE_LABEL[piece.type ?? ''] ?? piece.type}</Badge>
                  <Badge
                    variant={
                      piece.status === 'approved' ? 'success' : piece.status === 'rejected' ? 'destructive' : 'warning'
                    }
                  >
                    {piece.status}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {new Date(piece.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <div className="flex gap-2">
                  {piece.status !== 'approved' && (
                    <Button
                      size="sm"
                      disabled={update.isPending}
                      onClick={() => update.mutate({ id: piece.id, status: 'approved' })}
                    >
                      <Check /> Approve
                    </Button>
                  )}
                  {piece.status !== 'rejected' && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={update.isPending}
                      onClick={() => update.mutate({ id: piece.id, status: 'rejected' })}
                    >
                      <X /> Reject
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setEditing(editing === piece.id ? null : piece.id);
                      setEditBody(piece.body ?? '');
                    }}
                  >
                    <PenLine /> Edit
                  </Button>
                </div>
              </div>
              <p className="mt-3 font-medium">{piece.title}</p>
              {editing === piece.id ? (
                <div className="mt-2 space-y-2">
                  <Textarea rows={8} value={editBody} onChange={(e) => setEditBody(e.target.value)} />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      disabled={update.isPending}
                      onClick={() =>
                        update.mutate({ id: piece.id, body: editBody }, { onSuccess: () => setEditing(null) })
                      }
                    >
                      Save
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{piece.body}</p>
              )}
              {!!piece.grounding && (
                <p className="mt-3 text-xs text-muted-foreground">
                  Grounded on:{' '}
                  {(((piece.grounding as { keywords?: string[] }).keywords ?? []).join(', ') || 'your site profile')}
                </p>
              )}
            </CardContent>
          </Card>
        ))}
        {pieces.data?.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Nothing drafted yet — try a blog on your most-asked customer question.
          </p>
        )}
      </div>
    </div>
  );
}
