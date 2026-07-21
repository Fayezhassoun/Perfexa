'use client';

// Lead form builder (CONTRACTS §7): create forms, view embed snippet + hosted
// link. Field editing kept simple: label + type + required per row.

import { useState } from 'react';
import { Copy, Plus, Trash2 } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

interface FieldDraft {
  key: string;
  label: string;
  type: 'text' | 'email' | 'phone' | 'textarea';
  required: boolean;
}

const DEFAULT_FIELDS: FieldDraft[] = [
  { key: 'name', label: 'Your name', type: 'text', required: true },
  { key: 'email', label: 'Email', type: 'email', required: true },
  { key: 'phone', label: 'Phone', type: 'phone', required: false },
];

export default function LeadFormsPage() {
  const utils = trpc.useUtils();
  const forms = trpc.leads.forms.list.useQuery();
  const create = trpc.leads.forms.create.useMutation({
    onSuccess: () => {
      utils.leads.forms.invalidate();
      setName('');
      setFields(DEFAULT_FIELDS);
    },
  });

  const [name, setName] = useState('');
  const [fields, setFields] = useState<FieldDraft[]>(DEFAULT_FIELDS);
  const [copied, setCopied] = useState<string | null>(null);

  function setField(i: number, patch: Partial<FieldDraft>) {
    setFields((prev) => prev.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  }

  return (
    <div className="space-y-6 p-6">
      <h1 className="font-display text-2xl font-semibold tracking-tight">Lead capture forms</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">New form</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            placeholder="Form name (e.g. “Free quote request”)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="max-w-sm"
          />
          {fields.map((field, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <Input
                value={field.label}
                onChange={(e) =>
                  setField(i, {
                    label: e.target.value,
                    key: e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || `field_${i}`,
                  })
                }
                className="w-48"
              />
              <Select
                value={field.type}
                onChange={(e) => setField(i, { type: e.target.value as FieldDraft['type'] })}
                className="w-32"
              >
                <option value="text">Text</option>
                <option value="email">Email</option>
                <option value="phone">Phone</option>
                <option value="textarea">Long text</option>
              </Select>
              <label className="flex items-center gap-1 text-sm text-muted-foreground">
                <Switch checked={field.required} onCheckedChange={(v) => setField(i, { required: v })} />
                required
              </label>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Remove field"
                onClick={() => setFields((prev) => prev.filter((_, idx) => idx !== i))}
              >
                <Trash2 />
              </Button>
            </div>
          ))}
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setFields((prev) => [...prev, { key: `field_${prev.length}`, label: 'New field', type: 'text', required: false }])
              }
            >
              <Plus /> Add field
            </Button>
            <Button
              size="sm"
              disabled={!name.trim() || !fields.length || create.isPending}
              onClick={() => create.mutate({ name: name.trim(), fields })}
            >
              Create form
            </Button>
          </div>
          {create.error && <p className="text-sm text-destructive">{create.error.message}</p>}
        </CardContent>
      </Card>

      <div className="space-y-3">
        {(forms.data ?? []).map((form) => (
          <FormRow
            key={form.id}
            form={form}
            copied={copied === form.id}
            onCopied={() => {
              setCopied(form.id);
              setTimeout(() => setCopied(null), 1500);
            }}
          />
        ))}
      </div>
    </div>
  );
}

function FormRow({
  form,
  copied,
  onCopied,
}: {
  form: { id: string; name: string | null; fields: unknown; leadCount: number };
  copied: boolean;
  onCopied: () => void;
}) {
  const snippet = trpc.leads.forms.embedSnippet.useQuery({ id: form.id });
  const fields = (form.fields as FieldDraft[] | null) ?? [];

  return (
    <Card>
      <CardContent className="space-y-2 p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium">{form.name}</p>
            <p className="text-xs text-muted-foreground">
              {fields.map((f) => f.label).join(' · ')} — {form.leadCount} leads
            </p>
          </div>
          {snippet.data && (
            <div className="flex items-center gap-2">
              <a
                href={snippet.data.hostedUrl}
                target="_blank"
                rel="noreferrer"
                className="text-sm underline underline-offset-4"
              >
                Open hosted form
              </a>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  void navigator.clipboard.writeText(snippet.data.snippet);
                  onCopied();
                }}
              >
                <Copy /> {copied ? 'Copied!' : 'Copy embed'}
              </Button>
            </div>
          )}
        </div>
        {snippet.data && (
          <pre className="overflow-x-auto rounded bg-muted p-2 text-xs">{snippet.data.snippet}</pre>
        )}
      </CardContent>
    </Card>
  );
}
