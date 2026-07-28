'use client';

// Reputation management: review inbox with sentiment, AI-drafted replies,
// and gated public posting.

import { useState } from 'react';
import { MessageSquareReply, RefreshCw, Send, Sparkles, Star } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

function Stars({ rating }: { rating: number | null }) {
  return (
    <span className="flex items-center gap-0.5" aria-label={`${rating ?? 0} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={`h-3.5 w-3.5 ${i <= (rating ?? 0) ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/40'}`}
        />
      ))}
    </span>
  );
}

export default function ReviewsPage() {
  const utils = trpc.useUtils();
  const [sentiment, setSentiment] = useState('');
  const reviews = trpc.reviews.list.useQuery(
    sentiment ? { sentiment: sentiment as 'positive' | 'neutral' | 'negative' } : undefined,
  );
  const stats = trpc.reviews.stats.useQuery();
  const sync = trpc.reviews.sync.useMutation({ onSuccess: () => utils.reviews.invalidate() });
  const draftReply = trpc.reviews.draftReply.useMutation({ onSuccess: () => utils.reviews.invalidate() });
  const updateDraft = trpc.reviews.updateReplyDraft.useMutation({ onSuccess: () => utils.reviews.invalidate() });
  const postReply = trpc.reviews.postReply.useMutation({ onSuccess: () => utils.reviews.invalidate() });

  const [editing, setEditing] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  const s = stats.data;
  return (
    <div className="page-shell animate-page-in space-y-6" data-testid="reviews-page">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-semibold tracking-tight">Reviews</h1>
        <div className="flex items-center gap-2">
          <Select value={sentiment} onChange={(e) => setSentiment(e.target.value)} className="w-36">
            <option value="">All sentiment</option>
            <option value="positive">Positive</option>
            <option value="neutral">Neutral</option>
            <option value="negative">Negative</option>
          </Select>
          <Button variant="outline" size="sm" disabled={sync.isPending} onClick={() => sync.mutate()} data-testid="reviews-sync">
            <RefreshCw className={sync.isPending ? 'animate-spin' : ''} /> Sync reviews
          </Button>
        </div>
      </div>

      {s && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            { label: 'Average rating', value: s.avgRating != null ? `${s.avgRating}★` : '—' },
            { label: 'Total', value: s.total },
            { label: 'Positive', value: s.positive },
            { label: 'Negative', value: s.negative },
            { label: 'Awaiting reply', value: s.awaitingReply },
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

      <div className="space-y-3">
        {(reviews.data ?? []).map((review) => (
          <Card key={review.id} className="lift" data-testid="review-card">
            <CardContent className="space-y-3 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <span className="font-medium">{review.author}</span>
                  <Stars rating={review.rating} />
                  <Badge
                    variant={
                      review.sentiment === 'positive' ? 'success' : review.sentiment === 'negative' ? 'destructive' : 'secondary'
                    }
                  >
                    {review.sentiment}
                  </Badge>
                </div>
                <span className="text-xs text-muted-foreground">
                  {new Date(review.createdAt).toLocaleDateString()} · Google Business
                </span>
              </div>
              <p className="text-sm">{review.content}</p>

              {review.replyStatus === 'replied' ? (
                <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-3 text-sm">
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-emerald-500">Your reply (posted)</p>
                  {review.replyDraft}
                </div>
              ) : review.replyDraft ? (
                <div className="rounded-xl border border-primary/25 bg-primary/5 p-3">
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-primary">Drafted reply — not posted yet</p>
                  {editing === review.id ? (
                    <div className="space-y-2">
                      <Textarea rows={3} value={editText} onChange={(e) => setEditText(e.target.value)} />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          disabled={updateDraft.isPending || !editText.trim()}
                          onClick={() =>
                            updateDraft.mutate({ id: review.id, replyDraft: editText.trim() }, { onSuccess: () => setEditing(null) })
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
                    <>
                      <p className="text-sm">{review.replyDraft}</p>
                      <div className="mt-2 flex gap-2">
                        <Button
                          size="sm"
                          disabled={postReply.isPending}
                          onClick={() => postReply.mutate({ id: review.id, via: 'click' })}
                          data-testid="review-post-reply"
                        >
                          <Send /> Approve & post reply
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setEditing(review.id);
                            setEditText(review.replyDraft ?? '');
                          }}
                        >
                          Edit
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={draftReply.isPending}
                  onClick={() => draftReply.mutate({ id: review.id })}
                  data-testid="review-draft-reply"
                >
                  <Sparkles /> Draft a reply
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
        {reviews.data?.length === 0 && (
          <div className="flex flex-col items-start gap-2">
            <p className="text-sm text-muted-foreground">
              No reviews synced yet — hit “Sync reviews” to pull your Google Business reviews
              (sandbox data until you connect the real account).
            </p>
            <Button size="sm" disabled={sync.isPending} onClick={() => sync.mutate()}>
              <MessageSquareReply /> Sync now
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
