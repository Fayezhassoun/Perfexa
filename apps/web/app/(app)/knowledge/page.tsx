'use client';

import { useState } from 'react';
import { BookOpen, Search } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';

const SOURCES = [
  { key: 'google_ads_help', label: 'Google Ads Help' },
  { key: 'meta_help', label: 'Meta Business Help' },
  { key: 'tiktok_help', label: 'TikTok for Business' },
  { key: 'seo_guide', label: 'SEO guides' },
  { key: 'policy', label: 'Ad policy' },
] as const;

export default function KnowledgePage() {
  const [source, setSource] = useState('');
  const [q, setQ] = useState('');

  const list = trpc.knowledge.list.useQuery(
    source ? { source: source as (typeof SOURCES)[number]['key'] } : undefined,
    { enabled: !q.trim() },
  );
  const search = trpc.knowledge.search.useQuery({ q: q.trim() }, { enabled: q.trim().length > 0 });

  const docs = q.trim()
    ? (search.data ?? []).map((h) => ({ ...h, similarity: h.score }))
    : (list.data ?? []);

  return (
    <div className="page-shell animate-page-in space-y-4">
      <h1 className="font-display text-2xl font-semibold tracking-tight">Knowledge base</h1>
      <p className="text-sm text-muted-foreground">
        The best-practice library your agents ground their advice on.
      </p>
      <div className="flex flex-wrap gap-2">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-8" />
        </div>
        <Select value={source} onChange={(e) => setSource(e.target.value)} className="w-52">
          <option value="">All sources</option>
          {SOURCES.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </Select>
      </div>
      <div className="space-y-3">
        {docs.map((doc) => (
          <Card key={doc.id}>
            <CardContent className="p-4">
              <details>
                <summary className="flex cursor-pointer items-center justify-between gap-2">
                  <span className="flex items-center gap-2 font-medium">
                    <BookOpen className="h-4 w-4 text-primary" /> {doc.title}
                  </span>
                  <span className="flex items-center gap-2">
                    {'similarity' in doc && typeof doc.similarity === 'number' && (
                      <Badge variant="outline">{Math.round(doc.similarity * 100)}% match</Badge>
                    )}
                    <Badge variant="secondary">
                      {SOURCES.find((s) => s.key === doc.source)?.label ?? doc.source}
                    </Badge>
                  </span>
                </summary>
                <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">{doc.content}</p>
              </details>
            </CardContent>
          </Card>
        ))}
        {docs.length === 0 && <p className="text-sm text-muted-foreground">Nothing found.</p>}
      </div>
    </div>
  );
}
