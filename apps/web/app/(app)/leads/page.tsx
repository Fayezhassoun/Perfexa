'use client';

// Leads mini-CRM (CONTRACTS §7/§10): filterable table, inline status/notes
// editing, CSV export, link to the form builder.

import { useState } from 'react';
import Link from 'next/link';
import { Download, FileText } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageShell, PageHeader } from '@/components/page-shell';

const STATUSES = ['new', 'contacted', 'won', 'lost'] as const;

export default function LeadsPage() {
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const utils = trpc.useUtils();

  const leads = trpc.leads.list.useQuery({
    status: (status || undefined) as (typeof STATUSES)[number] | undefined,
    q: q || undefined,
  });
  const update = trpc.leads.update.useMutation({ onSuccess: () => utils.leads.invalidate() });
  const exportCsv = trpc.leads.exportCsv.useQuery(undefined, { enabled: false });

  async function downloadCsv() {
    const { data } = await exportCsv.refetch();
    if (!data) return;
    const blob = new Blob([data.csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'leads.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <PageShell className="space-y-4" data-testid="leads-page">
      <PageHeader
        eyebrow="Pipeline"
        title="Leads"
        description="Filterable contacts, score qualification, and notes. Export anytime to CSV."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href="/leads/forms">
                <FileText /> Forms
              </Link>
            </Button>
            <Button variant="outline" size="sm" onClick={downloadCsv}>
              <Download /> Export CSV
            </Button>
          </div>
        }
      />

      <div className="flex flex-wrap gap-2">
        <Input
          placeholder="Search name or email…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-xs"
        />
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-36">
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Contact</TableHead>
            <TableHead>Score</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Notes</TableHead>
            <TableHead>Captured</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {(leads.data ?? []).map((lead) => (
            <TableRow key={lead.id}>
              <TableCell className="font-medium">{lead.name ?? '—'}</TableCell>
              <TableCell className="text-muted-foreground">
                {[lead.email, lead.phone].filter(Boolean).join(' · ') || '—'}
              </TableCell>
              <TableCell>
                <Badge variant={(lead.score ?? 0) >= 60 ? 'success' : 'secondary'}>{lead.score ?? 0}</Badge>
              </TableCell>
              <TableCell>
                <Select
                  value={lead.status ?? 'new'}
                  onChange={(e) =>
                    update.mutate({ id: lead.id, status: e.target.value as (typeof STATUSES)[number] })
                  }
                  className="h-8 w-32"
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </Select>
              </TableCell>
              <TableCell>
                <Input
                  defaultValue={lead.notes ?? ''}
                  placeholder="Add a note…"
                  className="h-8 w-48"
                  onBlur={(e) => {
                    if (e.target.value !== (lead.notes ?? '')) {
                      update.mutate({ id: lead.id, notes: e.target.value });
                    }
                  }}
                />
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {new Date(lead.createdAt).toLocaleDateString()}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {leads.data?.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No leads yet. Create a form under Forms and share its link, or let the Lead Gen Agent add
          one to your site plan.
        </p>
      )}
    </PageShell>
  );
}
