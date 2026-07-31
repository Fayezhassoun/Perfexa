'use client';

import { useState, useRef } from 'react';
import { Brain, Search, Trash2, FileText, Link as LinkIcon, Upload, Tag } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { PageShell, PageHeader } from '@/components/page-shell';

type ImportTab = 'note' | 'url' | 'file';

interface MemoryDocItem {
  id: string;
  title: string | null;
  content: string | null;
  kind: string | null;
  tags: string[] | null;
  createdAt?: string | Date | null;
  similarity?: number;
}

export default function BusinessMemoryPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const trpcAny = trpc as any;
  const utils = trpcAny.useUtils();
  const [activeTab, setActiveTab] = useState<ImportTab>('note');

  // Form states
  const [noteTitle, setNoteTitle] = useState('');
  const [noteText, setNoteText] = useState('');
  const [noteTags, setNoteTags] = useState('');

  const [urlInput, setUrlInput] = useState('');
  const [urlTags, setUrlTags] = useState('');

  const [fileTags, setFileTags] = useState('');
  const [selectedFileName, setSelectedFileName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Search & Filter
  const [q, setQ] = useState('');
  const [selectedTag, setSelectedTag] = useState('');

  // Status/Error messages
  const [formError, setFormError] = useState<string | null>(null);

  // Queries
  const listQuery = trpcAny.memory.list.useQuery(
    selectedTag ? { tag: selectedTag } : undefined,
    { enabled: !q.trim() },
  );

  const searchQuery = trpcAny.memory.search.useQuery(
    { q: q.trim() },
    { enabled: q.trim().length > 0 },
  );

  // Mutations
  const addMutation = trpcAny.memory.add.useMutation({
    onSuccess: () => {
      utils.memory.list.invalidate();
      setNoteTitle('');
      setNoteText('');
      setNoteTags('');
      setFormError(null);
    },
    onError: (err: { message?: string }) => setFormError(err.message ?? 'Error adding note'),
  });

  const importUrlMutation = trpcAny.memory.importUrl.useMutation({
    onSuccess: () => {
      utils.memory.list.invalidate();
      setUrlInput('');
      setUrlTags('');
      setFormError(null);
    },
    onError: (err: { message?: string }) => setFormError(err.message ?? 'Error importing URL'),
  });

  const importFileMutation = trpcAny.memory.importFile.useMutation({
    onSuccess: () => {
      utils.memory.list.invalidate();
      setFileTags('');
      setSelectedFileName('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      setFormError(null);
    },
    onError: (err: { message?: string }) => setFormError(err.message ?? 'Error importing file'),
  });

  const removeMutation = trpcAny.memory.remove.useMutation({
    onSuccess: () => {
      utils.memory.list.invalidate();
    },
  });

  const parseTags = (str: string) =>
    str
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

  const handleNoteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteText.trim()) return;
    setFormError(null);
    addMutation.mutate({
      title: noteTitle.trim() || undefined,
      text: noteText.trim(),
      tags: parseTags(noteTags),
    });
  };

  const handleUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlInput.trim()) return;
    setFormError(null);
    importUrlMutation.mutate({
      url: urlInput.trim(),
      tags: parseTags(urlTags),
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFileName(file.name);
    setFormError(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (text) {
        importFileMutation.mutate({
          filename: file.name,
          mimeType: file.type || 'text/plain',
          text,
          tags: parseTags(fileTags),
        });
      }
    };
    reader.onerror = () => setFormError('Failed to read file.');
    reader.readAsText(file);
  };

  const rawSearchHits: MemoryDocItem[] = searchQuery.data ?? [];
  const rawListDocs: MemoryDocItem[] = listQuery.data ?? [];

  const docs: MemoryDocItem[] = q.trim()
    ? rawSearchHits.map((h) => ({ ...h, similarity: (h as { score?: number }).score }))
    : rawListDocs;

  // Collect all unique tags for tag filter buttons
  const allTags = Array.from(
    new Set(rawListDocs.flatMap((d) => (d.tags as string[] | null) ?? [])),
  );

  return (
    <PageShell className="space-y-6">
      <PageHeader
        eyebrow="Intelligence"
        title="Business Memory"
        description="Your business data that the agents ground their advice on. Private to your workspace."
      />

      {/* Import bar with three tabs */}
      <Card className="overflow-hidden border border-[color:var(--glass-border)] bg-[color:var(--glass-bg)] backdrop-blur-md">
        <div className="flex border-b border-[color:var(--glass-border)] bg-muted/30 p-1">
          <button
            type="button"
            onClick={() => {
              setActiveTab('note');
              setFormError(null);
            }}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
              activeTab === 'note'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <FileText className="h-4 w-4" /> Paste note
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('url');
              setFormError(null);
            }}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
              activeTab === 'url'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <LinkIcon className="h-4 w-4" /> From URL
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('file');
              setFormError(null);
            }}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
              activeTab === 'file'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Upload className="h-4 w-4" /> Upload file
          </button>
        </div>

        <CardContent className="p-4">
          {formError && (
            <div className="mb-3 rounded-lg bg-destructive/10 p-3 text-xs font-medium text-destructive">
              {formError}
            </div>
          )}

          {activeTab === 'note' && (
            <form onSubmit={handleNoteSubmit} className="space-y-3">
              <Input
                placeholder="Title (optional)"
                value={noteTitle}
                onChange={(e) => setNoteTitle(e.target.value)}
              />
              <Textarea
                placeholder="Paste business note, FAQ, policy, or guidelines here…"
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                rows={3}
                required
              />
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Input
                  placeholder="Tags (comma-separated, e.g. pricing, policy)"
                  value={noteTags}
                  onChange={(e) => setNoteTags(e.target.value)}
                  className="max-w-md flex-1"
                />
                <Button
                  type="submit"
                  disabled={addMutation.isPending || !noteText.trim()}
                  size="sm"
                >
                  {addMutation.isPending ? 'Saving…' : 'Save note'}
                </Button>
              </div>
            </form>
          )}

          {activeTab === 'url' && (
            <form onSubmit={handleUrlSubmit} className="space-y-3">
              <Input
                type="url"
                placeholder="https://example.com/about-us"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                required
              />
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Input
                  placeholder="Tags (comma-separated, e.g. website, services)"
                  value={urlTags}
                  onChange={(e) => setUrlTags(e.target.value)}
                  className="max-w-md flex-1"
                />
                <Button
                  type="submit"
                  disabled={importUrlMutation.isPending || !urlInput.trim()}
                  size="sm"
                >
                  {importUrlMutation.isPending ? 'Importing…' : 'Import URL'}
                </Button>
              </div>
            </form>
          )}

          {activeTab === 'file' && (
            <div className="space-y-3">
              <div className="flex flex-col gap-2">
                <input
                  type="file"
                  accept=".txt,.md,.csv,.json"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  className="text-sm text-muted-foreground file:mr-4 file:rounded-lg file:border-0 file:bg-primary/10 file:px-4 file:py-2 file:text-sm file:font-medium file:text-primary hover:file:bg-primary/20 cursor-pointer"
                />
                {selectedFileName && (
                  <p className="text-xs text-muted-foreground">
                    Selected: {selectedFileName}{' '}
                    {importFileMutation.isPending && '(Importing…)'}
                  </p>
                )}
              </div>
              <Input
                placeholder="Tags (comma-separated, e.g. specs, catalog)"
                value={fileTags}
                onChange={(e) => setFileTags(e.target.value)}
                className="max-w-md"
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Filter and Search Bar */}
      <div className="flex flex-wrap gap-2">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search business memory…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-8"
          />
        </div>

        {allTags.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Tag className="h-3 w-3" /> Filter:
            </span>
            <Button
              variant={selectedTag === '' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedTag('')}
              className="h-7 text-xs"
            >
              All
            </Button>
            {allTags.map((tag) => (
              <Button
                key={tag}
                variant={selectedTag === tag ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedTag(selectedTag === tag ? '' : tag)}
                className="h-7 text-xs"
              >
                {tag}
              </Button>
            ))}
          </div>
        )}
      </div>

      {/* List of Memories */}
      <div className="space-y-3">
        {docs.map((doc) => (
          <Card key={doc.id} className="transition-all hover:border-primary/20">
            <CardContent className="p-4">
              <details>
                <summary className="flex cursor-pointer items-center justify-between gap-2">
                  <div className="flex items-center gap-2 font-medium min-w-0 flex-1">
                    <Brain className="h-4 w-4 shrink-0 text-primary" />
                    <span className="truncate">{doc.title || 'Untitled Note'}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {typeof doc.similarity === 'number' && (
                      <Badge variant="outline">
                        {Math.round(doc.similarity * 100)}% match
                      </Badge>
                    )}
                    <Badge variant="secondary">{doc.kind ?? 'note'}</Badge>
                    {doc.tags && (doc.tags as string[]).map((t) => (
                      <Badge key={t} variant="outline" className="text-xs">
                        {t}
                      </Badge>
                    ))}
                    {doc.createdAt && (
                      <span className="text-xs text-muted-foreground">
                        {new Date(doc.createdAt).toLocaleDateString()}
                      </span>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm('Delete this memory?')) {
                          removeMutation.mutate({ id: doc.id });
                        }
                      }}
                      title="Delete memory"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </summary>
                <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">
                  {doc.content}
                </p>
              </details>
            </CardContent>
          </Card>
        ))}

        {docs.length === 0 && (
          <p className="text-sm text-muted-foreground py-8 text-center">
            {q.trim()
              ? 'No matching business memories found.'
              : 'No business memories added yet. Import your first note, URL, or document above.'}
          </p>
        )}
      </div>
    </PageShell>
  );
}
